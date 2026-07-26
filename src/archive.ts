import { createHash } from "node:crypto";
import { basename, join } from "node:path";
import { readFile, readdir } from "node:fs/promises";

import {
  assertPathInside,
  atomicWriteJson,
  fileExists,
  readJsonUnknown,
} from "./pipeline/files.js";

export const streamIndexPath = "src/live-stream-list.md";
export const episodesPath = "src/channel/episodes.json";
export const metadataPath = "src/channel/video-metadata.json";
export const manifestPath = "src/transcripts/manifest.json";
export const statusPath = "src/transcripts/fetch-status.json";
export const transcriptRoot = "src/transcripts/txt";
export const archiveHeader = "# 📺 Ancient Egypt and the Bible – Livestream Archive";

export type TranscriptPolicy = "expected" | "known-unavailable";
export type ArchiveLifecycle = "included" | "scheduled" | "live" | "processing" | "private" | "removed";

export interface EpisodeRecord {
  videoId: string;
  url: string;
  linkText: string;
  displayTitle: string;
  episodeNumber?: number;
  slug: string;
  fileStem: string;
  order: number;
  lifecycle: ArchiveLifecycle;
  transcriptPolicy: TranscriptPolicy;
}

export interface EpisodesStore {
  schemaVersion: 1;
  channel: {
    handleUrl: "https://www.youtube.com/@ancientegyptandthebible";
    channelId: string | null;
    uploadsPlaylistId: string | null;
  };
  episodes: EpisodeRecord[];
}

export interface TranscriptManifestRecord {
  videoId: string;
  fileStem: string;
  path: string;
  source: "legacy-json-bootstrap" | "youtube-transcript-plus" | "watch-page-captions";
  contentSha256: string;
  canonicalByteLength: number;
  segmentCount: number;
  firstStartSeconds?: number;
  lastStartSeconds?: number;
  fetchedAt?: string;
  selectedLanguage?: string;
  availableLanguages?: string[];
  captionKind?: "manual" | "automatic" | "unknown";
}

export interface TranscriptManifest {
  schemaVersion: 1;
  storage: {
    payload: "txt-only";
    pathTemplate: "txt/{fileStem}.txt";
    encoding: "utf8";
    lineEndings: "lf";
  };
  transcripts: TranscriptManifestRecord[];
}

export interface FetchFailure {
  videoId: string;
  attemptedAt: string;
  classification:
    | "no_caption_tracks"
    | "language_unavailable"
    | "empty_transcript"
    | "rate_limited_or_blocked"
    | "fetch_failed";
  message: string;
  retryAfter?: string;
}

export interface FetchStatus {
  schemaVersion: 1;
  failures: FetchFailure[];
}

export function parseStreamIndex(markdown: string): EpisodeRecord[] {
  const lines = canonicalText(markdown).trimEnd().split("\n");
  if (lines[0] !== archiveHeader) {
    throw new Error(`Unexpected stream-index heading: ${lines[0] ?? "(missing)"}`);
  }

  const records: EpisodeRecord[] = [];
  const pattern = /^- \[(.+)\]\(https:\/\/www\.youtube\.com\/watch\?v=([A-Za-z0-9_-]{11})\) `([a-z0-9]+(?:-[a-z0-9]+)*)`$/u;
  for (const line of lines.slice(1)) {
    if (!line.trim()) {
      continue;
    }
    const match = pattern.exec(line);
    if (match === null) {
      throw new Error(`Unsupported stream-index line: ${line}`);
    }
    const linkText = required(match[1], "link text");
    const videoId = required(match[2], "video ID");
    const slug = required(match[3], "slug");
    const numbered = /^Live Stream #(\d+):\s*(.+)$/u.exec(linkText);
    const displayTitle = numbered?.[2] ?? linkText;
    const record: EpisodeRecord = {
      videoId,
      url: `https://www.youtube.com/watch?v=${videoId}`,
      linkText,
      displayTitle,
      slug,
      fileStem: slug,
      order: records.length + 1,
      lifecycle: "included",
      transcriptPolicy: "expected",
    };
    if (numbered?.[1] !== undefined) {
      record.episodeNumber = Number(numbered[1]);
    }
    records.push(record);
  }
  validateEpisodes(records);
  return records;
}

export function renderStreamIndex(episodes: readonly EpisodeRecord[]): string {
  const lines = episodes.map((episode) =>
    `- [${episode.linkText}](https://www.youtube.com/watch?v=${episode.videoId}) \`${episode.slug}\``
  );
  return `${archiveHeader}\n${lines.join("\n")}\n`;
}

export function validateEpisodes(episodes: readonly EpisodeRecord[]): void {
  const videoIds = new Set<string>();
  const slugs = new Set<string>();
  for (const [index, episode] of episodes.entries()) {
    if (!/^[A-Za-z0-9_-]{11}$/u.test(episode.videoId)) {
      throw new Error(`Invalid YouTube video ID: ${episode.videoId}`);
    }
    if (!isPortableStem(episode.fileStem) || episode.slug !== episode.fileStem) {
      throw new Error(`Invalid or divergent stable fileStem for ${episode.videoId}: ${episode.fileStem}`);
    }
    const folded = episode.slug.toLowerCase();
    if (videoIds.has(episode.videoId) || slugs.has(folded)) {
      throw new Error(`Duplicate episode identity at order ${index + 1}: ${episode.videoId}/${episode.slug}`);
    }
    if (episode.order !== index + 1) {
      throw new Error(`Episode order is not contiguous at ${episode.videoId}`);
    }
    videoIds.add(episode.videoId);
    slugs.add(folded);
  }
}

export function validateTranscriptText(text: string): {
  canonicalText: string;
  segmentCount: number;
  firstStartSeconds?: number;
  lastStartSeconds?: number;
} {
  const canonical = canonicalText(text);
  if (!canonical || !canonical.endsWith("\n")) {
    throw new Error("Transcript must be non-empty and end in exactly one LF newline.");
  }
  if (canonical.endsWith("\n\n")) {
    throw new Error("Transcript must end in exactly one newline.");
  }

  const lines = canonical.slice(0, -1).split("\n");
  let firstStartSeconds: number | undefined;
  let lastStartSeconds: number | undefined;
  for (const [index, line] of lines.entries()) {
    const match = /^\[(\d+)\] ([0-9]+(?::[0-9]{2}){1,2})\t([^\r\n\t]*)$/u.exec(line);
    if (match === null || Number(match[1]) !== index) {
      throw new Error(`Invalid transcript row ${index + 1}: ${line.slice(0, 120)}`);
    }
    const seconds = timestampToSeconds(required(match[2], "timestamp"));
    firstStartSeconds ??= seconds;
    lastStartSeconds = seconds;
  }
  return {
    canonicalText: canonical,
    segmentCount: lines.length,
    ...(firstStartSeconds !== undefined ? { firstStartSeconds } : {}),
    ...(lastStartSeconds !== undefined ? { lastStartSeconds } : {}),
  };
}

export function transcriptRecordFromText(
  episode: EpisodeRecord,
  text: string,
  source: TranscriptManifestRecord["source"],
  extra: Partial<Pick<
    TranscriptManifestRecord,
    "fetchedAt" | "selectedLanguage" | "availableLanguages" | "captionKind"
  >> = {},
): TranscriptManifestRecord {
  const checked = validateTranscriptText(text);
  const bytes = Buffer.from(checked.canonicalText, "utf8");
  return {
    videoId: episode.videoId,
    fileStem: episode.fileStem,
    path: `txt/${episode.fileStem}.txt`,
    source,
    contentSha256: createHash("sha256").update(bytes).digest("hex"),
    canonicalByteLength: bytes.length,
    segmentCount: checked.segmentCount,
    ...(checked.firstStartSeconds !== undefined ? { firstStartSeconds: checked.firstStartSeconds } : {}),
    ...(checked.lastStartSeconds !== undefined ? { lastStartSeconds: checked.lastStartSeconds } : {}),
    ...extra,
  };
}

export async function bootstrapTranscriptStore(): Promise<{
  episodes: EpisodesStore;
  manifest: TranscriptManifest;
}> {
  const markdown = await readFile(streamIndexPath, "utf8");
  const records = parseStreamIndex(markdown);
  const manifestRecords: TranscriptManifestRecord[] = [];
  for (const episode of records) {
    const txtPath = join(transcriptRoot, `${episode.fileStem}.txt`);
    assertPathInside(transcriptRoot, txtPath);
    if (await fileExists(txtPath)) {
      const text = await readFile(txtPath, "utf8");
      manifestRecords.push(transcriptRecordFromText(episode, text, "legacy-json-bootstrap"));
    } else {
      episode.transcriptPolicy = "known-unavailable";
    }
  }
  const txtNames = (await readdir(transcriptRoot))
    .filter((name) => name.endsWith(".txt"))
    .map((name) => basename(name, ".txt"));
  const knownStems = new Set(records.map((record) => record.fileStem.toLowerCase()));
  const orphans = txtNames.filter((name) => !knownStems.has(name.toLowerCase()));
  if (orphans.length > 0) {
    throw new Error(`Orphan TXT files: ${orphans.join(", ")}`);
  }

  const episodes: EpisodesStore = {
    schemaVersion: 1,
    channel: {
      handleUrl: "https://www.youtube.com/@ancientegyptandthebible",
      channelId: null,
      uploadsPlaylistId: null,
    },
    episodes: records,
  };
  const manifest: TranscriptManifest = {
    schemaVersion: 1,
    storage: {
      payload: "txt-only",
      pathTemplate: "txt/{fileStem}.txt",
      encoding: "utf8",
      lineEndings: "lf",
    },
    transcripts: manifestRecords,
  };
  return { episodes, manifest };
}

export async function writeBootstrapStore(): Promise<void> {
  if (await fileExists(episodesPath) || await fileExists(manifestPath)) {
    throw new Error("Bootstrap is one-time only and refuses to overwrite an existing typed store.");
  }
  const { episodes, manifest } = await bootstrapTranscriptStore();
  await atomicWriteJson(episodesPath, episodes);
  await atomicWriteJson(manifestPath, manifest);
  await atomicWriteJson(metadataPath, {
    schemaVersion: 1,
    source: { api: "youtube-data-api-v3" },
    videos: [],
  });
  await atomicWriteJson(statusPath, {
    schemaVersion: 1,
    failures: [],
  } satisfies FetchStatus);
}

export async function readEpisodesStore(path = episodesPath): Promise<EpisodesStore> {
  const value = await readJsonUnknown(path);
  if (!isRecord(value) || value.schemaVersion !== 1 || !Array.isArray(value.episodes)) {
    throw new Error(`Unsupported episodes schema: ${path}`);
  }
  const channel = value.channel;
  if (!isRecord(channel) || channel.handleUrl !== "https://www.youtube.com/@ancientegyptandthebible") {
    throw new Error(`Invalid channel identity: ${path}`);
  }
  const episodes = value.episodes as EpisodeRecord[];
  validateEpisodes(episodes);
  return value as unknown as EpisodesStore;
}

export async function readManifest(path = manifestPath): Promise<TranscriptManifest> {
  const value = await readJsonUnknown(path);
  if (
    !isRecord(value) ||
    value.schemaVersion !== 1 ||
    !isRecord(value.storage) ||
    value.storage.payload !== "txt-only" ||
    !Array.isArray(value.transcripts)
  ) {
    throw new Error(`Unsupported transcript manifest schema: ${path}`);
  }
  return value as unknown as TranscriptManifest;
}

export async function readFetchStatus(path = statusPath): Promise<FetchStatus> {
  const value = await readJsonUnknown(path);
  if (!isRecord(value) || value.schemaVersion !== 1 || !Array.isArray(value.failures)) {
    throw new Error(`Unsupported fetch-status schema: ${path}`);
  }
  return value as unknown as FetchStatus;
}

export async function validateRepositoryStore(): Promise<{
  episodeCount: number;
  storedCount: number;
  unavailableCount: number;
}> {
  if (await fileExists(".tmp/transcript-store/transaction.json")) {
    throw new Error(
      "Unfinished transcript transaction found. Run check:transcript-store with --repair-transaction.",
    );
  }
  const store = await readEpisodesStore();
  const manifest = await readManifest();
  await readFetchStatus();
  const markdown = canonicalText(await readFile(streamIndexPath, "utf8"));
  if (renderStreamIndex(store.episodes) !== markdown) {
    throw new Error("src/live-stream-list.md is not the exact episodes.json projection.");
  }
  const manifestById = new Map(manifest.transcripts.map((record) => [record.videoId, record]));
  for (const episode of store.episodes) {
    const record = manifestById.get(episode.videoId);
    if (record !== undefined) {
      if (record === undefined || record.fileStem !== episode.fileStem) {
        throw new Error(`Missing or divergent manifest record: ${episode.videoId}`);
      }
      const path = join("src/transcripts", record.path);
      assertPathInside(transcriptRoot, path);
      const current = transcriptRecordFromText(
        episode,
        await readFile(path, "utf8"),
        record.source,
        pickManifestProvenance(record),
      );
      if (
        current.contentSha256 !== record.contentSha256 ||
        current.canonicalByteLength !== record.canonicalByteLength ||
        current.segmentCount !== record.segmentCount
      ) {
        throw new Error(`Transcript content drift: ${episode.videoId}`);
      }
    } else if (episode.transcriptPolicy !== "known-unavailable") {
      throw new Error(`Expected transcript is missing from the manifest: ${episode.videoId}`);
    }
  }
  if (manifest.transcripts.length !== manifestById.size) {
    throw new Error("Duplicate video IDs in transcript manifest.");
  }
  const knownStems = new Set(store.episodes.map((record) => record.fileStem.toLowerCase()));
  const orphanTxt = (await readdir(transcriptRoot))
    .filter((name) => name.endsWith(".txt"))
    .filter((name) => !knownStems.has(basename(name, ".txt").toLowerCase()));
  if (orphanTxt.length > 0) {
    throw new Error(`Orphan TXT files: ${orphanTxt.join(", ")}`);
  }
  return {
    episodeCount: store.episodes.length,
    storedCount: manifest.transcripts.length,
    unavailableCount: store.episodes.filter((record) => record.transcriptPolicy === "known-unavailable").length,
  };
}

export function canonicalText(value: string): string {
  return value.replace(/^\uFEFF/u, "").replace(/\r\n?/gu, "\n");
}

export function formatTimestamp(seconds: number): string {
  const whole = Math.max(0, Math.floor(seconds));
  const hours = Math.floor(whole / 3600);
  const minutes = Math.floor((whole % 3600) / 60);
  const remaining = whole % 60;
  return hours > 0
    ? `${hours}:${String(minutes).padStart(2, "0")}:${String(remaining).padStart(2, "0")}`
    : `${minutes}:${String(remaining).padStart(2, "0")}`;
}

export function timestampToSeconds(value: string): number {
  const parts = value.split(":").map(Number);
  if (parts.length === 2) {
    return (parts[0] ?? 0) * 60 + (parts[1] ?? 0);
  }
  if (parts.length === 3) {
    return (parts[0] ?? 0) * 3600 + (parts[1] ?? 0) * 60 + (parts[2] ?? 0);
  }
  throw new Error(`Invalid display timestamp: ${value}`);
}

function isPortableStem(value: string): boolean {
  const reserved = /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])$/iu;
  return /^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(value) &&
    !reserved.test(value) &&
    !/[. ]$/u.test(value);
}

function required(value: string | undefined, label: string): string {
  if (value === undefined || value.length === 0) {
    throw new Error(`Missing ${label}.`);
  }
  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function pickManifestProvenance(record: TranscriptManifestRecord): Partial<TranscriptManifestRecord> {
  return {
    ...(record.fetchedAt !== undefined ? { fetchedAt: record.fetchedAt } : {}),
    ...(record.selectedLanguage !== undefined ? { selectedLanguage: record.selectedLanguage } : {}),
    ...(record.availableLanguages !== undefined ? { availableLanguages: record.availableLanguages } : {}),
    ...(record.captionKind !== undefined ? { captionKind: record.captionKind } : {}),
  };
}
