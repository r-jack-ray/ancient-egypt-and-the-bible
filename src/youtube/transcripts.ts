import { randomUUID } from "node:crypto";
import { copyFile, readFile, rm } from "node:fs/promises";
import { join } from "node:path";

import { fetchTranscript as fetchTranscriptPlus } from "youtube-transcript-plus";
import type {
  FetchParams,
  TranscriptConfig,
  TranscriptResult,
  TranscriptSegment as PlusSegment,
} from "youtube-transcript-plus";

import {
  episodesPath,
  formatTimestamp,
  manifestPath,
  readEpisodesStore,
  readManifest,
  transcriptRecordFromText,
  transcriptRoot,
  type EpisodeRecord,
  type TranscriptManifest,
  type TranscriptManifestRecord,
} from "../archive.js";
import {
  assertPathInside,
  atomicWriteJson,
  atomicWriteText,
  errorCode,
  fileExists,
} from "../pipeline/files.js";
import { acquireWriterLease } from "../pipeline/lease.js";
import { createRateLimitedFetch, YoutubeRequestError } from "./rate-limit.js";

const userAgent =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36";
const maximumResponseBytes = 20 * 1024 * 1024;
const journalPath = ".tmp/transcript-store/transaction.json";

export interface CaptionSegment {
  startSeconds: number;
  durationSeconds: number;
  text: string;
}

export interface VideoTranscript {
  videoId: string;
  source: "youtube-transcript-plus" | "watch-page-captions";
  fetchedAt: string;
  selectedLanguage?: string;
  availableLanguages: string[];
  captionKind: "manual" | "automatic" | "unknown";
  segments: CaptionSegment[];
}

export interface FetchTranscriptOptions {
  videoId: string;
  requestDelayMs: number;
  language?: string;
  fetch?: typeof fetch;
  logger?: (message: string) => void;
}

export async function fetchVideoTranscript(options: FetchTranscriptOptions): Promise<VideoTranscript> {
  assertVideoId(options.videoId);
  const limitedFetch = options.fetch ?? createRateLimitedFetch({
    delayMs: options.requestDelayMs,
    ...(options.logger !== undefined ? { logger: options.logger } : {}),
  });
  try {
    return await fetchWithPlus(options, limitedFetch);
  } catch (error) {
    if (error instanceof YoutubeRequestError && error.classification === "rate_limited_or_blocked") {
      throw error;
    }
    options.logger?.(`Primary transcript provider failed: ${safeMessage(error)}. Trying caption-track fallback.`);
  }
  const fallback = await fetchWatchPageCaptions(options, limitedFetch);
  if (fallback === undefined) {
    throw new TranscriptFetchError(
      `No caption tracks found for video ${options.videoId}.`,
      "no_caption_tracks",
    );
  }
  return fallback;
}

export class TranscriptFetchError extends Error {
  constructor(
    message: string,
    readonly classification:
      | "no_caption_tracks"
      | "language_unavailable"
      | "empty_transcript"
      | "fetch_failed",
  ) {
    super(message);
  }
}

async function fetchWithPlus(
  options: FetchTranscriptOptions,
  limitedFetch: typeof fetch,
): Promise<VideoTranscript> {
  const config: TranscriptConfig & { videoDetails: true } = {
    retries: 0,
    userAgent,
    videoDetails: true,
    videoFetch: (params: FetchParams) => plusFetch(params, limitedFetch),
    playerFetch: (params: FetchParams) => plusFetch(params, limitedFetch),
    transcriptFetch: (params: FetchParams) => plusFetch(params, limitedFetch),
    ...(options.language !== undefined ? { lang: options.language } : {}),
  };
  const result = await fetchTranscriptPlus(options.videoId, config);
  return normalizePlus(options.videoId, result);
}

async function plusFetch(params: FetchParams, limitedFetch: typeof fetch): Promise<Response> {
  const headers: Record<string, string> = { ...(params.headers ?? {}) };
  if (params.lang) headers["accept-language"] = params.lang;
  if (params.userAgent) headers["user-agent"] = params.userAgent;
  return limitedFetch(params.url, {
    ...(params.method !== undefined ? { method: params.method } : {}),
    ...(params.body !== undefined ? { body: params.body } : {}),
    ...(params.signal !== undefined ? { signal: params.signal } : {}),
    headers,
  });
}

function normalizePlus(videoId: string, result: TranscriptResult): VideoTranscript {
  const sourceSegments = result.segments as PlusSegment[];
  const segments = sourceSegments
    .map((segment: PlusSegment) => normalizePlusSegment(segment))
    .filter((segment): segment is CaptionSegment => segment !== undefined);
  if (segments.length === 0) {
    throw new TranscriptFetchError(`Transcript contained no segments for ${videoId}.`, "empty_transcript");
  }
  const languages = [...new Set(
    sourceSegments.flatMap((segment: PlusSegment): string[] =>
      typeof segment.lang === "string" && segment.lang ? [segment.lang] : []
    ),
  )];
  return {
    videoId,
    source: "youtube-transcript-plus",
    fetchedAt: new Date().toISOString(),
    ...(languages[0] !== undefined ? { selectedLanguage: languages[0] } : {}),
    availableLanguages: languages,
    captionKind: "unknown",
    segments,
  };
}

function normalizePlusSegment(segment: PlusSegment): CaptionSegment | undefined {
  const text = cleanCaptionText(segment.text);
  if (!text) return undefined;
  return {
    startSeconds: Math.max(0, segment.offset),
    durationSeconds: Math.max(0, segment.duration),
    text,
  };
}

async function fetchWatchPageCaptions(
  options: FetchTranscriptOptions,
  limitedFetch: typeof fetch,
): Promise<VideoTranscript | undefined> {
  const watch = await readLimitedText(
    await limitedFetch(`https://www.youtube.com/watch?v=${options.videoId}`, {
      headers: { "user-agent": userAgent, "accept-language": "en-US,en;q=0.9" },
    }),
  );
  if (/captcha|unusual traffic/iu.test(watch)) {
    throw new YoutubeRequestError("YouTube returned blocking/CAPTCHA evidence.", "rate_limited_or_blocked");
  }
  const player = extractAssignedJson(watch, "ytInitialPlayerResponse");
  const tracks = captionTracks(player);
  if (tracks.length === 0) return undefined;
  const selected = selectCaptionTrack(tracks, options.language);
  if (selected === undefined) {
    throw new TranscriptFetchError(
      `No caption track matched language ${options.language ?? "(default)"}.`,
      "language_unavailable",
    );
  }
  const separator = selected.baseUrl.includes("?") ? "&" : "?";
  const payload = await readLimitedText(await limitedFetch(`${selected.baseUrl}${separator}fmt=json3`));
  const segments = extractJson3Segments(JSON.parse(payload) as unknown);
  if (segments.length === 0) {
    throw new TranscriptFetchError(`Caption track contained no segments for ${options.videoId}.`, "empty_transcript");
  }
  return {
    videoId: options.videoId,
    source: "watch-page-captions",
    fetchedAt: new Date().toISOString(),
    selectedLanguage: selected.languageCode,
    availableLanguages: [...new Set(tracks.map((track) => track.languageCode))],
    captionKind: selected.kind === "asr" ? "automatic" : "manual",
    segments,
  };
}

interface CaptionTrack {
  baseUrl: string;
  languageCode: string;
  kind?: string;
}

function captionTracks(player: unknown): CaptionTrack[] {
  const tracks = pathValue(player, [
    "captions",
    "playerCaptionsTracklistRenderer",
    "captionTracks",
  ]);
  if (!Array.isArray(tracks)) return [];
  return tracks.flatMap((value) => {
    const object = asRecord(value);
    const baseUrl = stringValue(object?.baseUrl);
    const languageCode = stringValue(object?.languageCode);
    if (baseUrl === undefined || languageCode === undefined) return [];
    const kind = stringValue(object?.kind);
    return [{ baseUrl, languageCode, ...(kind !== undefined ? { kind } : {}) }];
  });
}

function selectCaptionTrack(
  tracks: CaptionTrack[],
  language: string | undefined,
): CaptionTrack | undefined {
  if (language !== undefined) {
    const wanted = language.toLowerCase();
    return tracks.find((track) => track.languageCode.toLowerCase() === wanted);
  }
  return tracks.find((track) => track.languageCode.startsWith("en") && track.kind !== "asr") ??
    tracks.find((track) => track.languageCode.startsWith("en")) ??
    tracks[0];
}

export function extractJson3Segments(value: unknown): CaptionSegment[] {
  const events = asRecord(value)?.events;
  if (!Array.isArray(events)) return [];
  return events.flatMap((event) => {
    const object = asRecord(event);
    const startMs = numberValue(object?.tStartMs);
    const durationMs = numberValue(object?.dDurationMs) ?? 0;
    const pieces = object?.segs;
    if (startMs === undefined || !Array.isArray(pieces)) return [];
    const text = cleanCaptionText(
      pieces.map((piece) => stringValue(asRecord(piece)?.utf8) ?? "").join(""),
    );
    return text ? [{ startSeconds: startMs / 1000, durationSeconds: durationMs / 1000, text }] : [];
  });
}

export function transcriptToText(transcript: VideoTranscript): string {
  if (transcript.segments.length === 0) {
    throw new TranscriptFetchError("Refusing to render an empty transcript.", "empty_transcript");
  }
  return `${transcript.segments.map((segment, index) =>
    `[${index}] ${formatTimestamp(Math.floor(segment.startSeconds))}\t${cleanCaptionText(segment.text)}`
  ).join("\n")}\n`;
}

export function orderTranscriptRecords(
  records: TranscriptManifestRecord[],
  episodes: EpisodeRecord[],
): TranscriptManifestRecord[] {
  const episodeOrder = new Map(
    episodes.map((episode, index) => [episode.videoId, index]),
  );
  return [...records].sort((left, right) => {
    const leftOrder = episodeOrder.get(left.videoId) ?? Number.MAX_SAFE_INTEGER;
    const rightOrder = episodeOrder.get(right.videoId) ?? Number.MAX_SAFE_INTEGER;
    return leftOrder - rightOrder || left.videoId.localeCompare(right.videoId);
  });
}

export async function findStoredTranscript(videoId: string): Promise<TranscriptManifestRecord | undefined> {
  const manifest = await readManifest();
  const record = manifest.transcripts.find((candidate) => candidate.videoId === videoId);
  if (record === undefined) return undefined;
  const path = join("src/transcripts", record.path);
  return await fileExists(path) ? record : undefined;
}

export async function storeTranscript(
  transcript: VideoTranscript,
  options: { force?: boolean; expectedCurrentHash?: string } = {},
): Promise<TranscriptManifestRecord> {
  const episodes = await readEpisodesStore();
  const episode = episodes.episodes.find((record) => record.videoId === transcript.videoId);
  if (episode === undefined) {
    throw new Error(`Refusing canonical write for unregistered video ID ${transcript.videoId}.`);
  }
  const lease = await acquireWriterLease(`store-transcript-${transcript.videoId}`);
  try {
    if (await fileExists(journalPath)) {
      throw new Error(`Unfinished transcript transaction requires recovery: ${journalPath}`);
    }
    const manifest = await readManifest();
    const previous = manifest.transcripts.find((record) => record.videoId === transcript.videoId);
    if (previous !== undefined && !options.force) {
      throw new Error(`Transcript is already stored for ${transcript.videoId}; explicit scoped force is required.`);
    }
    if (
      previous !== undefined &&
      options.expectedCurrentHash !== previous.contentSha256
    ) {
      throw new Error(
        `Forced replacement requires --expected-current-hash ${previous.contentSha256}.`,
      );
    }

    const text = transcriptToText(transcript);
    const record = transcriptRecordFromText(
      episode,
      text,
      transcript.source,
      {
        fetchedAt: transcript.fetchedAt,
        ...(transcript.selectedLanguage !== undefined
          ? { selectedLanguage: transcript.selectedLanguage }
          : {}),
        availableLanguages: transcript.availableLanguages,
        captionKind: transcript.captionKind,
      },
    );
    const destination = join(transcriptRoot, `${episode.fileStem}.txt`);
    assertPathInside(transcriptRoot, destination);
    const backup = `${destination}.${randomUUID()}.recovery`;
    const existed = await fileExists(destination);
    if (existed) await copyFile(destination, backup);
    await atomicWriteJson(journalPath, {
      schemaVersion: 1,
      videoId: transcript.videoId,
      destination,
      backup: existed ? backup : null,
      phase: "prepared",
      previousRecord: previous ?? null,
      proposedRecord: record,
    });
    try {
      await atomicWriteText(destination, text);
      await atomicWriteJson(journalPath, {
        schemaVersion: 1,
        videoId: transcript.videoId,
        destination,
        backup: existed ? backup : null,
        phase: "txt-replaced",
        previousRecord: previous ?? null,
        proposedRecord: record,
      });
      const next: TranscriptManifest = {
        ...manifest,
        transcripts: orderTranscriptRecords(
          [
            ...manifest.transcripts.filter((candidate) => candidate.videoId !== transcript.videoId),
            record,
          ],
          episodes.episodes,
        ),
      };
      await atomicWriteJson(journalPath, {
        schemaVersion: 1,
        videoId: transcript.videoId,
        destination,
        backup: existed ? backup : null,
        phase: "manifest-authorized",
        previousRecord: previous ?? null,
        proposedRecord: record,
      });
      await atomicWriteJson(manifestPath, next);
      await atomicWriteJson(journalPath, {
        schemaVersion: 1,
        videoId: transcript.videoId,
        destination,
        backup: existed ? backup : null,
        phase: "manifest-committed",
        previousRecord: previous ?? null,
        proposedRecord: record,
      });
      await rm(backup, { force: true });
      await rm(journalPath, { force: true });
      return record;
    } catch (error) {
      if (existed) {
        await copyFile(backup, destination);
      } else {
        await rm(destination, { force: true });
      }
      await rm(backup, { force: true });
      await rm(journalPath, { force: true });
      throw error;
    }
  } finally {
    await lease.release();
  }
}

export async function recoverTranscriptTransaction(): Promise<"none" | "rolled-back" | "completed"> {
  if (!(await fileExists(journalPath))) return "none";
  const journal = asRecord(JSON.parse(await readFile(journalPath, "utf8")) as unknown);
  const videoId = stringValue(journal?.videoId);
  const destination = stringValue(journal?.destination);
  const backupValue = journal?.backup;
  const backup = typeof backupValue === "string" ? backupValue : undefined;
  const proposed = asRecord(journal?.proposedRecord) as TranscriptManifestRecord | undefined;
  if (
    journal?.schemaVersion !== 1 ||
    videoId === undefined ||
    destination === undefined ||
    proposed === undefined
  ) {
    throw new Error(`Unrecognized transcript transaction journal: ${journalPath}`);
  }
  assertPathInside(transcriptRoot, destination);
  const manifest = await readManifest();
  const committed = manifest.transcripts.find((record) => record.videoId === videoId);
  const forwardComplete = committed?.contentSha256 === proposed.contentSha256 &&
    await fileExists(destination);
  if (forwardComplete) {
    if (backup !== undefined) await rm(backup, { force: true });
    await rm(journalPath, { force: true });
    return "completed";
  }
  if (backup !== undefined && await fileExists(backup)) {
    await copyFile(backup, destination);
  } else {
    await rm(destination, { force: true });
  }
  if (backup !== undefined) await rm(backup, { force: true });
  await rm(journalPath, { force: true });
  return "rolled-back";
}

export function classifyFetchError(error: unknown):
  | "no_caption_tracks"
  | "language_unavailable"
  | "empty_transcript"
  | "rate_limited_or_blocked"
  | "fetch_failed" {
  if (error instanceof YoutubeRequestError) return error.classification;
  if (error instanceof TranscriptFetchError) return error.classification;
  const message = safeMessage(error);
  if (/no caption tracks?/iu.test(message)) return "no_caption_tracks";
  if (/language/iu.test(message)) return "language_unavailable";
  if (/empty|no segments/iu.test(message)) return "empty_transcript";
  if (/\b429\b|captcha|blocked|too many requests/iu.test(message)) return "rate_limited_or_blocked";
  return "fetch_failed";
}

export function cleanCaptionText(value: string): string {
  return decodeEntities(value)
    .replace(/<[^>]*>/gu, " ")
    .replace(/[\r\n\t]+/gu, " ")
    .replace(/ {2,}/gu, " ")
    .trim();
}

async function readLimitedText(response: Response): Promise<string> {
  const declared = Number(response.headers.get("content-length") ?? 0);
  if (Number.isFinite(declared) && declared > maximumResponseBytes) {
    throw new TranscriptFetchError("YouTube response exceeded the maximum allowed size.", "fetch_failed");
  }
  const text = await response.text();
  if (Buffer.byteLength(text, "utf8") > maximumResponseBytes) {
    throw new TranscriptFetchError("YouTube response exceeded the maximum allowed size.", "fetch_failed");
  }
  return text;
}

function extractAssignedJson(html: string, variableName: string): unknown {
  const marker = `${variableName}`;
  const markerIndex = html.indexOf(marker);
  if (markerIndex < 0) return undefined;
  const start = html.indexOf("{", markerIndex + marker.length);
  if (start < 0) return undefined;
  let depth = 0;
  let quoted = false;
  let escaped = false;
  for (let index = start; index < html.length; index += 1) {
    const character = html[index];
    if (quoted) {
      if (escaped) escaped = false;
      else if (character === "\\") escaped = true;
      else if (character === '"') quoted = false;
      continue;
    }
    if (character === '"') quoted = true;
    else if (character === "{") depth += 1;
    else if (character === "}") {
      depth -= 1;
      if (depth === 0) return JSON.parse(html.slice(start, index + 1)) as unknown;
    }
  }
  return undefined;
}

function decodeEntities(value: string): string {
  return value
    .replace(/&amp;/gu, "&")
    .replace(/&lt;/gu, "<")
    .replace(/&gt;/gu, ">")
    .replace(/&quot;/gu, '"')
    .replace(/&#39;|&apos;/gu, "'")
    .replace(/&#(\d+);/gu, (_match, digits: string) => String.fromCodePoint(Number(digits)));
}

function pathValue(value: unknown, path: string[]): unknown {
  let current = value;
  for (const key of path) current = asRecord(current)?.[key];
  return current;
}
function asRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null ? value as Record<string, unknown> : undefined;
}
function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value ? value : undefined;
}
function numberValue(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() && Number.isFinite(Number(value))) return Number(value);
  return undefined;
}
function safeMessage(error: unknown): string {
  return error instanceof Error ? error.message.slice(0, 500) : "Unknown transcript error.";
}
function assertVideoId(value: string): void {
  if (!/^[A-Za-z0-9_-]{11}$/u.test(value)) throw new Error(`Invalid YouTube video ID: ${value}`);
}
