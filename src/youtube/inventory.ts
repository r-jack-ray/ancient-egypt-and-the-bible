import { google } from "googleapis";
import { readFile, rm } from "node:fs/promises";

import {
  episodesPath,
  metadataPath,
  readEpisodesStore,
  renderStreamIndex,
  streamIndexPath,
  validateEpisodes,
  type EpisodeRecord,
  type EpisodesStore,
} from "../archive.js";
import { acquireWriterLease } from "../pipeline/lease.js";
import {
  atomicWriteJson,
  atomicWriteText,
  fileExists,
  stableJson,
  writeDiagnostic,
} from "../pipeline/files.js";
import { fetchVideoMetadata, type VideoMetadataRecord, type VideoMetadataStore } from "./metadata.js";

export interface InventoryCandidate {
  schemaVersion: 1;
  complete: boolean;
  source: {
    handleUrl: string;
    channelId: string;
    uploadsPlaylistId: string;
  };
  additions: EpisodeRecord[];
  omittedBaselineVideoIds: string[];
  titleChanges: { videoId: string; established: string; latestApiTitle: string }[];
  excludedOrdinaryUploadIds: string[];
  candidateEpisodes: EpisodeRecord[];
  metadata: VideoMetadataRecord[];
}

export const inventoryJournalPath = ".tmp/transcript-store/inventory-transaction.json";

export async function fetchInventoryCandidate(options: {
  apiKey: string;
  delayMs: number;
  maxPages?: number;
  logger?: (message: string) => void;
}): Promise<InventoryCandidate> {
  const baseline = await readEpisodesStore();
  const youtube = google.youtube({ version: "v3", auth: options.apiKey });
  const handle = baseline.channel.handleUrl.split("@").at(-1);
  if (!handle) {
    throw new Error("Configured channel handle is invalid.");
  }
  const channelResponse = await youtube.channels.list({
    part: ["contentDetails"],
    forHandle: handle,
    maxResults: 1,
  });
  const channel = channelResponse.data.items?.[0];
  const channelId = channel?.id ?? undefined;
  const uploadsPlaylistId = channel?.contentDetails?.relatedPlaylists?.uploads ?? undefined;
  if (!channelId || !uploadsPlaylistId) {
    throw new Error("The configured YouTube handle did not resolve to an uploads playlist.");
  }
  if (baseline.channel.channelId !== null && baseline.channel.channelId !== channelId) {
    throw new Error(`Channel ID mismatch: expected ${baseline.channel.channelId}, received ${channelId}.`);
  }
  if (
    baseline.channel.uploadsPlaylistId !== null &&
    baseline.channel.uploadsPlaylistId !== uploadsPlaylistId
  ) {
    throw new Error("Uploads playlist ID mismatch.");
  }

  const uploadIds: string[] = [];
  let token: string | undefined;
  let pages = 0;
  do {
    pages += 1;
    if (pages > 1 && options.delayMs > 0) {
      await new Promise<void>((resolve) => setTimeout(resolve, options.delayMs));
    }
    const response = await youtube.playlistItems.list({
      part: ["contentDetails"],
      playlistId: uploadsPlaylistId,
      maxResults: 50,
      ...(token !== undefined ? { pageToken: token } : {}),
    });
    for (const item of response.data.items ?? []) {
      const id = item.contentDetails?.videoId;
      if (typeof id === "string" && !uploadIds.includes(id)) {
        uploadIds.push(id);
      }
    }
    token = response.data.nextPageToken ?? undefined;
    options.logger?.(`Fetched uploads page ${pages}; videos=${uploadIds.length}.`);
  } while (token !== undefined && (options.maxPages === undefined || pages < options.maxPages));

  const complete = token === undefined;
  const metadata = await fetchVideoMetadata({
    apiKey: options.apiKey,
    videoIds: uploadIds,
    delayMs: options.delayMs,
    ...(options.logger !== undefined ? { logger: options.logger } : {}),
  });
  const baselineById = new Map(baseline.episodes.map((record) => [record.videoId, record]));
  const metadataById = new Map(metadata.map((record) => [record.videoId, record]));
  const streamMetadata = metadata.filter(isLivestream);
  const additions = streamMetadata
    .filter((record) => !baselineById.has(record.videoId))
    .map((record, index) => episodeFromVideoMetadata(record, baseline.episodes.length + index + 1));
  const omittedBaselineVideoIds = baseline.episodes
    .filter((record) => !metadataById.has(record.videoId))
    .map((record) => record.videoId);
  const titleChanges = baseline.episodes.flatMap((record) => {
    const latest = metadataById.get(record.videoId)?.title;
    return latest !== undefined && latest !== record.linkText
      ? [{ videoId: record.videoId, established: record.linkText, latestApiTitle: latest }]
      : [];
  });
  const excludedOrdinaryUploadIds = metadata
    .filter((record) => !isLivestream(record) && !baselineById.has(record.videoId))
    .map((record) => record.videoId);
  return {
    schemaVersion: 1,
    complete,
    source: {
      handleUrl: baseline.channel.handleUrl,
      channelId,
      uploadsPlaylistId,
    },
    additions,
    omittedBaselineVideoIds,
    titleChanges,
    excludedOrdinaryUploadIds,
    candidateEpisodes: [...additions, ...baseline.episodes].map((record, index) => ({
      ...record,
      order: index + 1,
    })),
    metadata,
  };
}

export async function applyInventoryCandidate(
  candidate: InventoryCandidate,
  options: {
    acceptSource: boolean;
    acceptedAdditionIds: readonly string[];
  },
): Promise<void> {
  if (!candidate.complete) {
    throw new Error("A partial inventory cannot update canonical files.");
  }
  const current = await readEpisodesStore();
  if (
    (current.channel.channelId === null || current.channel.uploadsPlaylistId === null) &&
    !options.acceptSource
  ) {
    throw new Error("First apply requires --accept-source to pin the resolved channel and uploads playlist.");
  }
  const accepted = new Set(options.acceptedAdditionIds);
  const nextEpisodes = buildAcceptedInventoryEpisodes(
    current.episodes,
    candidate.additions,
    [...accepted],
  );
  const next: EpisodesStore = {
    schemaVersion: 1,
    channel: {
      handleUrl: current.channel.handleUrl,
      channelId: candidate.source.channelId,
      uploadsPlaylistId: candidate.source.uploadsPlaylistId,
    },
    episodes: nextEpisodes,
  };
  validateEpisodes(next.episodes);
  const lease = await acquireWriterLease("apply-channel-inventory");
  try {
    const archiveIds = new Set(next.episodes.map((record) => record.videoId));
    const metadata: VideoMetadataStore = {
      schemaVersion: 1,
      source: { api: "youtube-data-api-v3" },
      videos: candidate.metadata.filter((record) => archiveIds.has(record.videoId)),
    };
    const previous = {
      episodes: await readFile(episodesPath, "utf8"),
      streamIndex: await readFile(streamIndexPath, "utf8"),
      metadata: await readFile(metadataPath, "utf8"),
    };
    const proposed = {
      episodes: stableJson(next),
      streamIndex: renderStreamIndex(next.episodes),
      metadata: stableJson(metadata),
    };
    await atomicWriteJson(inventoryJournalPath, {
      schemaVersion: 1,
      phase: "prepared",
      previous,
      proposed,
    });
    try {
      await atomicWriteText(episodesPath, proposed.episodes);
      await atomicWriteText(streamIndexPath, proposed.streamIndex);
      await atomicWriteText(metadataPath, proposed.metadata);
      await rm(inventoryJournalPath, { force: true });
    } catch (error) {
      await atomicWriteText(episodesPath, previous.episodes);
      await atomicWriteText(streamIndexPath, previous.streamIndex);
      await atomicWriteText(metadataPath, previous.metadata);
      await rm(inventoryJournalPath, { force: true });
      throw error;
    }
  } finally {
    await lease.release();
  }
}

export function buildAcceptedInventoryEpisodes(
  currentEpisodes: readonly EpisodeRecord[],
  additions: readonly EpisodeRecord[],
  acceptedAdditionIds: readonly string[],
): EpisodeRecord[] {
  const additionsById = new Map(additions.map((record) => [record.videoId, record]));
  const accepted = new Set(acceptedAdditionIds);
  const unknown = [...accepted].filter((videoId) => !additionsById.has(videoId));
  if (unknown.length > 0) {
    throw new Error(`Accepted video IDs are not proposed additions: ${unknown.join(", ")}`);
  }
  if (additions.length > 0 && accepted.size === 0) {
    throw new Error("Apply requires at least one --accept-addition or --accept-latest selection.");
  }
  return [
    ...additions.filter((record) => accepted.has(record.videoId)),
    ...currentEpisodes,
  ].map((record, index) => ({
    ...record,
    order: index + 1,
  }));
}

export function latestNumberedAddition(
  additions: readonly EpisodeRecord[],
): EpisodeRecord | undefined {
  return additions.find((record) => record.episodeNumber !== undefined);
}

export async function recoverInventoryTransaction(): Promise<"none" | "rolled-back" | "completed"> {
  if (!(await fileExists(inventoryJournalPath))) return "none";
  const value = JSON.parse(await readFile(inventoryJournalPath, "utf8")) as unknown;
  const journal = asRecord(value);
  const previous = asStringRecord(journal?.previous);
  const proposed = asStringRecord(journal?.proposed);
  if (
    journal?.schemaVersion !== 1 ||
    previous === undefined ||
    proposed === undefined
  ) {
    throw new Error(`Unrecognized inventory transaction journal: ${inventoryJournalPath}`);
  }
  const current = {
    episodes: await readFile(episodesPath, "utf8"),
    streamIndex: await readFile(streamIndexPath, "utf8"),
    metadata: await readFile(metadataPath, "utf8"),
  };
  const complete = current.episodes === proposed.episodes &&
    current.streamIndex === proposed.streamIndex &&
    current.metadata === proposed.metadata;
  if (!complete) {
    await atomicWriteText(episodesPath, previous.episodes);
    await atomicWriteText(streamIndexPath, previous.streamIndex);
    await atomicWriteText(metadataPath, previous.metadata);
  }
  await rm(inventoryJournalPath, { force: true });
  return complete ? "completed" : "rolled-back";
}

export async function writeInventoryReport(path: string, candidate: InventoryCandidate): Promise<void> {
  await writeDiagnostic(path, candidate);
}

function isLivestream(record: VideoMetadataRecord): boolean {
  return record.scheduledStartAt !== undefined ||
    record.actualStartAt !== undefined ||
    record.actualEndAt !== undefined ||
    record.liveBroadcastContent === "upcoming" ||
    record.liveBroadcastContent === "live";
}

export function episodeFromVideoMetadata(record: VideoMetadataRecord, order: number): EpisodeRecord {
  const title = record.title ?? `YouTube livestream ${record.videoId}`;
  const numbered = /^Live Stream #(\d+):\s*(.+)$/u.exec(title);
  const displayTitle = numbered?.[2] ?? title;
  const episodeNumber = numbered?.[1] === undefined ? undefined : Number(numbered[1]);
  const stem = (episodeNumber === undefined
    ? slugify(displayTitle)
    : `${episodeNumber}-${slugify(displayTitle)}`) || `youtube-livestream-${record.videoId.toLowerCase()}`;
  const episode: EpisodeRecord = {
    videoId: record.videoId,
    url: `https://www.youtube.com/watch?v=${record.videoId}`,
    linkText: title,
    displayTitle,
    slug: stem,
    fileStem: stem,
    order,
    lifecycle: lifecycle(record),
    transcriptPolicy: "expected",
  };
  if (episodeNumber !== undefined) episode.episodeNumber = episodeNumber;
  return episode;
}

function lifecycle(record: VideoMetadataRecord): EpisodeRecord["lifecycle"] {
  if (record.liveBroadcastContent === "upcoming") {
    return "scheduled";
  }
  if (record.liveBroadcastContent === "live") {
    return "live";
  }
  if (record.uploadStatus === "uploaded") {
    return "processing";
  }
  if (record.privacyStatus === "private") {
    return "private";
  }
  return "included";
}

function slugify(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, "-")
    .replace(/^-+|-+$/gu, "");
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
}

function asStringRecord(value: unknown): {
  episodes: string;
  streamIndex: string;
  metadata: string;
} | undefined {
  const record = asRecord(value);
  return typeof record?.episodes === "string" &&
    typeof record.streamIndex === "string" &&
    typeof record.metadata === "string"
    ? {
        episodes: record.episodes,
        streamIndex: record.streamIndex,
        metadata: record.metadata,
      }
    : undefined;
}
