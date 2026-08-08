import {
  readEpisodesStore,
  readFetchStatus,
  statusPath,
  type FetchFailure,
  type FetchStatus,
} from "../archive.js";
import { writeJsonIfChanged } from "../pipeline/files.js";
import { readVideoMetadataStore, resolveVideoReadiness } from "./metadata.js";
import {
  classifyFetchError,
  fetchVideoTranscript,
  findStoredTranscript,
  storeTranscript,
  type FetchTranscriptOptions,
  type VideoTranscript,
} from "./transcripts.js";
import { createRateLimitedFetch, YoutubeRequestError } from "./rate-limit.js";

export interface BatchOptions {
  requestDelayMs: number;
  limit?: number;
  dryRun?: boolean;
  language?: string;
  logger?: (message: string) => void;
  fetcher?: (options: FetchTranscriptOptions) => Promise<VideoTranscript>;
  fetch?: typeof fetch;
  rateLimitNow?: () => number;
  sleep?: (milliseconds: number) => Promise<void>;
}

export interface BatchTranscriptRecord {
  videoId: string;
  path: string;
}

export interface BatchDeferredRecord extends BatchTranscriptRecord {
  reason: string;
}

export interface BatchFailureRecord extends BatchTranscriptRecord {
  classification: FetchFailure["classification"];
  message: string;
  retryAfter?: string;
}

export interface BatchPendingRecord extends BatchTranscriptRecord {
  reason: "blocked" | "dry_run" | "limit";
}

export interface BatchResult {
  fetched: number;
  failed: number;
  storedSkipped: number;
  unavailableSkipped: number;
  deferred: number;
  pending: number;
  blocked: boolean;
  newTranscripts: BatchTranscriptRecord[];
  deferredRecords: BatchDeferredRecord[];
  failureRecords: BatchFailureRecord[];
  pendingRecords: BatchPendingRecord[];
}

export async function fetchTranscriptBatch(options: BatchOptions): Promise<BatchResult> {
  const episodes = await readEpisodesStore();
  const status = await readFetchStatus();
  const failures = new Map(status.failures.map((failure) => [failure.videoId, failure]));
  const metadata = await readVideoMetadataStore();
  const metadataById = new Map(metadata.videos.map((record) => [record.videoId, record]));
  const result: BatchResult = {
    fetched: 0,
    failed: 0,
    storedSkipped: 0,
    unavailableSkipped: 0,
    deferred: 0,
    pending: 0,
    blocked: false,
    newTranscripts: [],
    deferredRecords: [],
    failureRecords: [],
    pendingRecords: [],
  };
  const fetcher = options.fetcher ?? fetchVideoTranscript;
  const transcriptFetch = createRateLimitedFetch({
    delayMs: 0,
    ...(options.fetch !== undefined ? { baseFetch: options.fetch } : {}),
    ...(options.logger !== undefined ? { logger: options.logger } : {}),
    ...(options.rateLimitNow !== undefined ? { now: options.rateLimitNow } : {}),
    ...(options.sleep !== undefined ? { sleep: options.sleep } : {}),
  });
  const now = options.rateLimitNow ?? Date.now;
  const sleep = options.sleep ?? ((milliseconds: number) =>
    new Promise<void>((resolve) => setTimeout(resolve, milliseconds))
  );
  let previousTranscriptStart: number | undefined;
  let selected = 0;

  for (const episode of episodes.episodes) {
    const pendingRecord = {
      videoId: episode.videoId,
      path: canonicalTranscriptPath(episode.fileStem),
    };
    if (await findStoredTranscript(episode.videoId)) {
      result.storedSkipped += 1;
      if (!options.dryRun && failures.delete(episode.videoId)) {
        await checkpoint(failures);
      }
      continue;
    }
    if (episode.transcriptPolicy === "known-unavailable") {
      result.unavailableSkipped += 1;
      if (!options.dryRun && failures.delete(episode.videoId)) {
        await checkpoint(failures);
      }
      continue;
    }
    const metadataRecord = metadataById.get(episode.videoId);
    if (metadataRecord === undefined) {
      result.deferred += 1;
      result.deferredRecords.push({ ...pendingRecord, reason: "metadata_missing" });
      continue;
    }
    const readiness = resolveVideoReadiness(metadataRecord);
    if (readiness.state !== "ready") {
      result.deferred += 1;
      result.deferredRecords.push({ ...pendingRecord, reason: readiness.reason });
      continue;
    }
    if (result.blocked) {
      result.pending += 1;
      result.pendingRecords.push({ ...pendingRecord, reason: "blocked" });
      continue;
    }
    if (options.limit !== undefined && selected >= options.limit) {
      result.pending += 1;
      result.pendingRecords.push({ ...pendingRecord, reason: "limit" });
      continue;
    }
    selected += 1;
    if (options.dryRun) {
      result.pending += 1;
      result.pendingRecords.push({ ...pendingRecord, reason: "dry_run" });
      options.logger?.(`Would fetch ${episode.videoId} -> src/transcripts/txt/${episode.fileStem}.txt`);
      continue;
    }
    if (previousTranscriptStart !== undefined) {
      const wait = Math.max(0, previousTranscriptStart + options.requestDelayMs - now());
      if (wait > 0) {
        options.logger?.(`Waiting ${Math.ceil(wait / 1000)}s before the next transcript fetch.`);
        await sleep(wait);
      }
    }
    previousTranscriptStart = now();
    try {
      const transcript = await fetcher({
        videoId: episode.videoId,
        requestDelayMs: 0,
        fetch: transcriptFetch,
        ...(options.language !== undefined ? { language: options.language } : {}),
        ...(options.logger !== undefined ? { logger: options.logger } : {}),
      });
      const stored = await storeTranscript(transcript);
      failures.delete(episode.videoId);
      result.fetched += 1;
      result.newTranscripts.push({
        videoId: episode.videoId,
        path: `src/transcripts/${stored.path}`,
      });
    } catch (error) {
      const classification = classifyFetchError(error);
      const failure: FetchFailure = {
        videoId: episode.videoId,
        attemptedAt: new Date().toISOString(),
        classification,
        message: safeMessage(error),
        ...(error instanceof YoutubeRequestError && error.retryAfter !== undefined
          ? { retryAfter: error.retryAfter }
          : {}),
      };
      failures.set(episode.videoId, failure);
      result.failed += 1;
      result.failureRecords.push({
        ...pendingRecord,
        classification,
        message: failure.message,
        ...(failure.retryAfter !== undefined ? { retryAfter: failure.retryAfter } : {}),
      });
      await checkpoint(failures);
      if (classification === "rate_limited_or_blocked") {
        result.blocked = true;
      }
      continue;
    }
    await checkpoint(failures);
  }
  return result;
}

export function formatTranscriptBatchHandoff(result: BatchResult): string {
  const lines = [
    `Transcript batch: fetched=${result.fetched} failed=${result.failed} stored-skipped=${result.storedSkipped} ` +
      `unavailable-skipped=${result.unavailableSkipped} deferred=${result.deferred} ` +
      `pending=${result.pending}`,
  ];
  appendSection(
    lines,
    "New TXT",
    result.newTranscripts.map((record) => `${record.path} (${record.videoId})`),
  );
  appendSection(
    lines,
    "Deferred",
    result.deferredRecords.map((record) =>
      `${record.path} (${record.videoId}): ${record.reason}`
    ),
  );
  appendSection(
    lines,
    "Failed",
    result.failureRecords.map((record) =>
      `${record.path} (${record.videoId}): ${record.classification} ${record.message}` +
      (record.retryAfter === undefined ? "" : ` retry-after=${record.retryAfter}`)
    ),
  );
  appendSection(
    lines,
    "Pending",
    result.pendingRecords.map((record) =>
      `${record.path} (${record.videoId}): ${record.reason}`
    ),
  );
  return lines.join("\n");
}

async function checkpoint(failures: ReadonlyMap<string, FetchFailure>): Promise<void> {
  const status: FetchStatus = {
    schemaVersion: 1,
    failures: [...failures.values()].sort((left, right) => left.videoId.localeCompare(right.videoId)),
  };
  await writeJsonIfChanged(statusPath, status);
}

function safeMessage(error: unknown): string {
  const message = error instanceof Error
    ? error.message
    : typeof error === "string"
    ? error
    : "Unknown transcript fetch failure.";
  return message.replace(/\s+/gu, " ").slice(0, 500);
}

function canonicalTranscriptPath(fileStem: string): string {
  return `src/transcripts/txt/${fileStem}.txt`;
}

function appendSection(lines: string[], label: string, records: readonly string[]): void {
  if (records.length === 0) {
    lines.push(`${label}: none`);
    return;
  }
  lines.push(`${label}:`, ...records.map((record) => `  ${record}`));
}
