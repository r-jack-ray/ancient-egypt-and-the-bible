import { readFile, rm } from "node:fs/promises";
import { resolve } from "node:path";

import {
  episodesPath,
  inventoryJournalPath,
  metadataPath,
  readEpisodesStore,
  validateEpisodes,
  type EpisodeRecord,
  type EpisodesStore,
} from "../archive.js";
import { acquireWriterLease } from "../pipeline/lease.js";
import {
  atomicWriteJson,
  atomicWriteText,
  stableJson,
  writeDiagnostic,
} from "../pipeline/files.js";
import { createYoutubeDataApiClient } from "./data-api.js";
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
  metadata: VideoMetadataRecord[];
}

export interface InventoryDeltaReport {
  schemaVersion: 1;
  generatedAt: string;
  source: InventoryCandidate["source"];
  complete: boolean;
  additions: {
    count: number;
    videos: {
      videoId: string;
      url: string;
      title: string;
      fileStem: string;
      episodeNumber?: number;
    }[];
  };
  omissions: {
    count: number;
    baselineVideoIds: string[];
  };
  titleChanges: {
    count: number;
    videos: InventoryCandidate["titleChanges"];
  };
  excludedUploads: {
    count: number;
    videoIds: string[];
  };
}

const writerLeasePath = ".tmp/transcript-store/writer.lock";

export async function fetchInventoryCandidate(options: {
  apiKey: string;
  delayMs: number;
  repoRoot?: string;
  maxPages?: number;
  fetch?: typeof fetch;
  sleep?: (milliseconds: number) => Promise<void>;
  now?: () => Date;
  logger?: (message: string) => void;
}): Promise<InventoryCandidate> {
  const baseline = await readEpisodesStore(resolve(options.repoRoot ?? ".", episodesPath));
  const youtube = createYoutubeDataApiClient({
    apiKey: options.apiKey,
    ...(options.fetch !== undefined ? { fetch: options.fetch } : {}),
    ...(options.sleep !== undefined ? { sleep: options.sleep } : {}),
  });
  const sleep = options.sleep ?? ((milliseconds: number) =>
    new Promise<void>((resolve) => setTimeout(resolve, milliseconds))
  );
  const handle = baseline.channel.handleUrl.split("@").at(-1);
  if (!handle) {
    throw new Error("Configured channel handle is invalid.");
  }
  const channel = await youtube.fetchChannelUploads(handle);
  const channelId = channel?.channelId;
  const uploadsPlaylistId = channel?.uploadsPlaylistId;
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
      await sleep(options.delayMs);
    }
    const page = await youtube.fetchPlaylistVideoPage(uploadsPlaylistId, token);
    for (const id of page.videoIds) {
      if (!uploadIds.includes(id)) {
        uploadIds.push(id);
      }
    }
    token = page.nextPageToken;
    options.logger?.(`Fetched uploads page ${pages}; videos=${uploadIds.length}.`);
  } while (token !== undefined && (options.maxPages === undefined || pages < options.maxPages));

  const complete = token === undefined;
  const metadata = await fetchVideoMetadata({
    apiKey: options.apiKey,
    videoIds: uploadIds,
    delayMs: options.delayMs,
    ...(options.fetch !== undefined ? { fetch: options.fetch } : {}),
    ...(options.sleep !== undefined ? { sleep: options.sleep } : {}),
    ...(options.now !== undefined ? { now: options.now } : {}),
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
    metadata,
  };
}

export async function applyInventoryCandidate(
  candidate: InventoryCandidate,
  options: {
    acceptSource: boolean;
    acceptedAdditionIds: readonly string[];
    repoRoot?: string;
  },
): Promise<void> {
  if (!candidate.complete) {
    throw new Error("A partial inventory cannot update canonical files.");
  }
  const repoRoot = resolve(options.repoRoot ?? ".");
  const episodeFile = resolve(repoRoot, episodesPath);
  const metadataFile = resolve(repoRoot, metadataPath);
  const journalFile = resolve(repoRoot, inventoryJournalPath);
  const current = await readEpisodesStore(episodeFile);
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
  const lease = await acquireWriterLease(
    "apply-channel-inventory",
    resolve(repoRoot, writerLeasePath),
  );
  try {
    const archiveIds = new Set(next.episodes.map((record) => record.videoId));
    const metadata: VideoMetadataStore = {
      schemaVersion: 1,
      source: { api: "youtube-data-api-v3" },
      videos: candidate.metadata.filter((record) => archiveIds.has(record.videoId)),
    };
    const previous = {
      episodes: await readFile(episodeFile, "utf8"),
      metadata: await readFile(metadataFile, "utf8"),
    };
    const proposed = {
      episodes: stableJson(next),
      metadata: stableJson(metadata),
    };
    await atomicWriteJson(journalFile, {
      schemaVersion: 1,
      phase: "prepared",
      previous,
      proposed,
    });
    try {
      await atomicWriteText(episodeFile, proposed.episodes);
      await atomicWriteText(metadataFile, proposed.metadata);
      await rm(journalFile, { force: true });
    } catch (error) {
      await atomicWriteText(episodeFile, previous.episodes);
      await atomicWriteText(metadataFile, previous.metadata);
      await rm(journalFile, { force: true });
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

export function buildInventoryDeltaReport(
  candidate: InventoryCandidate,
  now = new Date(),
): InventoryDeltaReport {
  return {
    schemaVersion: 1,
    generatedAt: now.toISOString(),
    source: { ...candidate.source },
    complete: candidate.complete,
    additions: {
      count: candidate.additions.length,
      videos: candidate.additions.map((record) => ({
        videoId: record.videoId,
        url: record.url,
        title: record.linkText,
        fileStem: record.fileStem,
        ...(record.episodeNumber !== undefined ? { episodeNumber: record.episodeNumber } : {}),
      })),
    },
    omissions: {
      count: candidate.omittedBaselineVideoIds.length,
      baselineVideoIds: [...candidate.omittedBaselineVideoIds],
    },
    titleChanges: {
      count: candidate.titleChanges.length,
      videos: candidate.titleChanges.map((change) => ({ ...change })),
    },
    excludedUploads: {
      count: candidate.excludedOrdinaryUploadIds.length,
      videoIds: [...candidate.excludedOrdinaryUploadIds],
    },
  };
}

export async function writeInventoryReport(
  path: string,
  candidate: InventoryCandidate,
  now = new Date(),
): Promise<void> {
  await writeDiagnostic(path, buildInventoryDeltaReport(candidate, now));
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
    transcriptPolicy: "expected",
  };
  if (episodeNumber !== undefined) episode.episodeNumber = episodeNumber;
  return episode;
}

function slugify(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, "-")
    .replace(/^-+|-+$/gu, "");
}
