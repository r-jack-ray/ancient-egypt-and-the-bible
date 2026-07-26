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
import { YoutubeRequestError } from "./rate-limit.js";

export interface BatchOptions {
  requestDelayMs: number;
  limit?: number;
  retryFailed?: boolean;
  dryRun?: boolean;
  language?: string;
  logger?: (message: string) => void;
  fetcher?: (options: FetchTranscriptOptions) => Promise<VideoTranscript>;
}

export interface BatchResult {
  fetched: number;
  failed: number;
  storedSkipped: number;
  unavailableSkipped: number;
  deferred: number;
  previousFailureSkipped: number;
  pending: number;
  blocked: boolean;
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
    previousFailureSkipped: 0,
    pending: 0,
    blocked: false,
  };
  const fetcher = options.fetcher ?? fetchVideoTranscript;
  let attempts = 0;

  for (const episode of episodes.episodes) {
    if (await findStoredTranscript(episode.videoId)) {
      result.storedSkipped += 1;
      continue;
    }
    if (episode.transcriptPolicy === "known-unavailable" && !options.retryFailed) {
      result.unavailableSkipped += 1;
      continue;
    }
    const previousFailure = failures.get(episode.videoId);
    if (previousFailure !== undefined && !options.retryFailed) {
      result.previousFailureSkipped += 1;
      continue;
    }
    const metadataRecord = metadataById.get(episode.videoId);
    if (metadataRecord === undefined) {
      result.deferred += 1;
      continue;
    }
    const readiness = resolveVideoReadiness(metadataRecord);
    if (readiness.state !== "ready") {
      result.deferred += 1;
      continue;
    }
    if (options.limit !== undefined && attempts >= options.limit) {
      result.pending += 1;
      continue;
    }
    if (options.dryRun) {
      result.pending += 1;
      options.logger?.(`Would fetch ${episode.videoId} -> src/transcripts/txt/${episode.fileStem}.txt`);
      continue;
    }
    attempts += 1;
    try {
      const transcript = await fetcher({
        videoId: episode.videoId,
        requestDelayMs: options.requestDelayMs,
        ...(options.language !== undefined ? { language: options.language } : {}),
        ...(options.logger !== undefined ? { logger: options.logger } : {}),
      });
      await storeTranscript(transcript);
      failures.delete(episode.videoId);
      result.fetched += 1;
      await checkpoint(failures);
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
      await checkpoint(failures);
      if (classification === "rate_limited_or_blocked") {
        result.blocked = true;
        break;
      }
    }
  }
  return result;
}

async function checkpoint(failures: ReadonlyMap<string, FetchFailure>): Promise<void> {
  const status: FetchStatus = {
    schemaVersion: 1,
    failures: [...failures.values()].sort((left, right) => left.videoId.localeCompare(right.videoId)),
  };
  await writeJsonIfChanged(statusPath, status);
}

function safeMessage(error: unknown): string {
  return error instanceof Error
    ? error.message.replace(/\s+/gu, " ").slice(0, 500)
    : "Unknown transcript fetch failure.";
}
