import { metadataPath, readEpisodesStore } from "../archive.js";
import { errorCode, readJsonUnknown, writeJsonIfChanged } from "../pipeline/files.js";
import {
  createYoutubeDataApiClient,
  type YoutubeVideoResource,
} from "./data-api.js";

export interface VideoMetadataRecord {
  videoId: string;
  fetchedAt: string;
  title?: string;
  publishedAt?: string;
  durationSeconds?: number;
  liveBroadcastContent?: "none" | "upcoming" | "live";
  scheduledStartAt?: string;
  actualStartAt?: string;
  actualEndAt?: string;
  privacyStatus?: string;
  uploadStatus?: string;
}

export interface VideoMetadataStore {
  schemaVersion: 1;
  source: { api: "youtube-data-api-v3" };
  videos: VideoMetadataRecord[];
}

export async function fetchVideoMetadata(options: {
  apiKey: string;
  videoIds: readonly string[];
  delayMs: number;
  fetch?: typeof fetch;
  sleep?: (milliseconds: number) => Promise<void>;
  now?: () => Date;
  logger?: (message: string) => void;
}): Promise<VideoMetadataRecord[]> {
  const youtube = createYoutubeDataApiClient({
    apiKey: options.apiKey,
    ...(options.fetch !== undefined ? { fetch: options.fetch } : {}),
    ...(options.sleep !== undefined ? { sleep: options.sleep } : {}),
  });
  const sleep = options.sleep ?? ((milliseconds: number) =>
    new Promise<void>((resolve) => setTimeout(resolve, milliseconds))
  );
  const now = options.now ?? (() => new Date());
  const records: VideoMetadataRecord[] = [];
  for (let index = 0; index < options.videoIds.length; index += 50) {
    if (index > 0 && options.delayMs > 0) {
      await sleep(options.delayMs);
    }
    const ids = options.videoIds.slice(index, index + 50);
    options.logger?.(`Fetching YouTube metadata ${index + 1}-${index + ids.length}.`);
    const items = await youtube.fetchVideos(ids);
    const fetchedAt = now().toISOString();
    for (const item of items) {
      const record = normalizeVideo(item, fetchedAt);
      if (record !== undefined) {
        records.push(record);
      }
    }
  }
  return records;
}

export async function fetchAndStoreVideoMetadata(options: {
  apiKey: string;
  delayMs: number;
  output?: string;
  limit?: number;
  refreshAll?: boolean;
  fetch?: typeof fetch;
  sleep?: (milliseconds: number) => Promise<void>;
  now?: () => Date;
  logger?: (message: string) => void;
}): Promise<VideoMetadataStore> {
  const episodes = await readEpisodesStore();
  const ids = episodes.episodes.map((record) => record.videoId);
  const output = options.output ?? metadataPath;
  const existing = await readVideoMetadataStore(output);
  const byId = new Map(existing.videos.map((record) => [record.videoId, record]));
  const selected = selectMetadataRefreshVideoIds(ids, existing.videos, {
    ...(options.limit !== undefined ? { limit: options.limit } : {}),
    ...(options.refreshAll ? { refreshAll: true } : {}),
  });
  const fetched = await fetchVideoMetadata({
    apiKey: options.apiKey,
    videoIds: selected,
    delayMs: options.delayMs,
    ...(options.fetch !== undefined ? { fetch: options.fetch } : {}),
    ...(options.sleep !== undefined ? { sleep: options.sleep } : {}),
    ...(options.now !== undefined ? { now: options.now } : {}),
    ...(options.logger !== undefined ? { logger: options.logger } : {}),
  });
  for (const record of fetched) byId.set(record.videoId, record);
  const videos = ids.flatMap((videoId) => {
    const record = byId.get(videoId);
    return record === undefined ? [] : [record];
  });
  const store: VideoMetadataStore = {
    schemaVersion: 1,
    source: { api: "youtube-data-api-v3" },
    videos,
  };
  await writeJsonIfChanged(output, store);
  return store;
}

export function selectMetadataRefreshVideoIds(
  videoIds: readonly string[],
  existingRecords: readonly VideoMetadataRecord[],
  options: { limit?: number; refreshAll?: boolean } = {},
): string[] {
  const byId = new Map(existingRecords.map((record) => [record.videoId, record]));
  const selected = videoIds.filter((videoId) => {
    if (options.refreshAll) return true;
    const record = byId.get(videoId);
    return record === undefined || resolveVideoReadiness(record).state !== "ready";
  });
  return options.limit === undefined ? selected : selected.slice(0, options.limit);
}

export async function readVideoMetadataStore(path = metadataPath): Promise<VideoMetadataStore> {
  let value: unknown;
  try {
    value = await readJsonUnknown(path);
  } catch (error) {
    if (errorCode(error) === "ENOENT") {
      return { schemaVersion: 1, source: { api: "youtube-data-api-v3" }, videos: [] };
    }
    throw error;
  }
  if (!isRecord(value) || value.schemaVersion !== 1 || !Array.isArray(value.videos)) {
    throw new Error(`Unsupported video metadata schema: ${path}`);
  }
  return value as unknown as VideoMetadataStore;
}

export function resolveVideoReadiness(record: VideoMetadataRecord | undefined):
  | { state: "ready" }
  | { state: "deferred"; reason: string }
  | { state: "invalid"; reason: string } {
  if (record === undefined) {
    return { state: "invalid", reason: "metadata_missing" };
  }
  if (record.liveBroadcastContent === "upcoming") {
    return { state: "deferred", reason: "upcoming" };
  }
  if (record.liveBroadcastContent === "live") {
    return { state: "deferred", reason: "live_in_progress" };
  }
  if (record.uploadStatus === "uploaded") {
    return { state: "deferred", reason: "processing" };
  }
  if (record.uploadStatus !== "processed") {
    return { state: "invalid", reason: "invalid_upload_status" };
  }
  if (record.durationSeconds === undefined || record.durationSeconds <= 0) {
    return { state: "invalid", reason: "invalid_duration" };
  }
  if (
    (record.scheduledStartAt !== undefined || record.actualStartAt !== undefined) &&
    record.actualEndAt === undefined
  ) {
    return { state: "deferred", reason: "completion_unconfirmed" };
  }
  return { state: "ready" };
}

export function parseYoutubeDuration(value: string | null | undefined): number | undefined {
  if (value === null || value === undefined) {
    return undefined;
  }
  const match = /^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+(?:\.\d+)?)S)?)?$/u.exec(value);
  if (match === null) {
    return undefined;
  }
  return (Number(match[1] ?? 0) * 86_400) +
    (Number(match[2] ?? 0) * 3_600) +
    (Number(match[3] ?? 0) * 60) +
    Number(match[4] ?? 0);
}

function normalizeVideo(
  item: YoutubeVideoResource,
  fetchedAt: string,
): VideoMetadataRecord | undefined {
  const videoId = item.id ?? undefined;
  if (videoId === undefined) {
    return undefined;
  }
  const record: VideoMetadataRecord = { videoId, fetchedAt };
  assign(record, "title", item.snippet?.title);
  assign(record, "publishedAt", item.snippet?.publishedAt);
  const durationSeconds = parseYoutubeDuration(item.contentDetails?.duration);
  if (durationSeconds !== undefined) {
    record.durationSeconds = durationSeconds;
  }
  const broadcast = item.snippet?.liveBroadcastContent;
  if (broadcast === "none" || broadcast === "upcoming" || broadcast === "live") {
    record.liveBroadcastContent = broadcast;
  }
  assign(record, "scheduledStartAt", item.liveStreamingDetails?.scheduledStartTime);
  assign(record, "actualStartAt", item.liveStreamingDetails?.actualStartTime);
  assign(record, "actualEndAt", item.liveStreamingDetails?.actualEndTime);
  assign(record, "privacyStatus", item.status?.privacyStatus);
  assign(record, "uploadStatus", item.status?.uploadStatus);
  return record;
}

function assign<K extends keyof VideoMetadataRecord>(
  record: VideoMetadataRecord,
  key: K,
  value: VideoMetadataRecord[K] | null | undefined,
): void {
  if (value !== undefined && value !== null) {
    record[key] = value;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
