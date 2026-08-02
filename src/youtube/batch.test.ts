import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import {
  transcriptRecordFromText,
  type EpisodeRecord,
  type FetchFailure,
  type TranscriptManifest,
} from "../archive.js";
import {
  fetchTranscriptBatch,
  formatTranscriptBatchHandoff,
} from "./batch.js";
import { type VideoMetadataRecord } from "./metadata.js";
import { YoutubeRequestError } from "./rate-limit.js";
import { TranscriptFetchError, type VideoTranscript } from "./transcripts.js";

test("batch writes every ready missing TXT with one shared request limiter and a deterministic handoff", async () => {
  const episodes = [
    episode("STORED00001", "stored-episode", 1),
    episode("READY000001", "ready-one", 2),
    episode("UNAVAIL0001", "known-unavailable-one", 3, "known-unavailable"),
    episode("READY000002", "ready-two", 4),
    episode("UNAVAIL0002", "known-unavailable-two", 5, "known-unavailable"),
    episode("UPCOMING001", "upcoming-stream", 6),
    episode("MISSING0001", "missing-metadata", 7),
    episode("FAILED00001", "previous-failure", 8),
  ];
  const previousFailure: FetchFailure = {
    videoId: "FAILED00001",
    attemptedAt: "2026-08-01T00:00:00.000Z",
    classification: "no_caption_tracks",
    message: "Previously unavailable.",
  };
  const staleStoredFailure: FetchFailure = {
    videoId: "STORED00001",
    attemptedAt: "2026-08-01T00:00:00.000Z",
    classification: "fetch_failed",
    message: "Stored after this status was recorded.",
  };

  await withFixture({
    episodes,
    metadata: [
      readyMetadata("READY000001"),
      readyMetadata("READY000002"),
      {
        videoId: "UPCOMING001",
        fetchedAt: "2026-08-01T00:00:00.000Z",
        durationSeconds: 0,
        uploadStatus: "uploaded",
        liveBroadcastContent: "upcoming",
      },
      readyMetadata("FAILED00001"),
    ],
    failures: [staleStoredFailure, previousFailure],
    storedEpisodes: [episodes[0]!],
  }, async (root) => {
    const episodeStoreBefore = await readFile(join(root, "src/channel/episodes.json"), "utf8");
    let clock = 1_000;
    const requestStarts: number[] = [];
    const waits: number[] = [];
    const fetchedIds: string[] = [];
    const result = await fetchTranscriptBatch({
      requestDelayMs: 500,
      rateLimitNow: () => clock,
      sleep: async (milliseconds) => {
        waits.push(milliseconds);
        clock += milliseconds;
      },
      fetch: async () => {
        requestStarts.push(clock);
        clock += 100;
        return new Response("ok");
      },
      fetcher: async (options) => {
        fetchedIds.push(options.videoId);
        assert.ok(options.fetch);
        await options.fetch(`https://example.test/${options.videoId}`);
        return transcript(options.videoId);
      },
    });

    assert.deepEqual(fetchedIds, ["READY000001", "READY000002", "FAILED00001"]);
    assert.deepEqual(requestStarts, [1_000, 1_500, 2_000]);
    assert.deepEqual(waits, [400, 400]);
    assert.deepEqual(
      {
        fetched: result.fetched,
        failed: result.failed,
        storedSkipped: result.storedSkipped,
        unavailableSkipped: result.unavailableSkipped,
        deferred: result.deferred,
        pending: result.pending,
        blocked: result.blocked,
      },
      {
        fetched: 3,
        failed: 0,
        storedSkipped: 1,
        unavailableSkipped: 2,
        deferred: 2,
        pending: 0,
        blocked: false,
      },
    );
    assert.equal(
      formatTranscriptBatchHandoff(result),
      [
        "Transcript batch: fetched=3 failed=0 stored-skipped=1 unavailable-skipped=2 deferred=2 pending=0",
        "New TXT:",
        "  src/transcripts/txt/ready-one.txt (READY000001)",
        "  src/transcripts/txt/ready-two.txt (READY000002)",
        "  src/transcripts/txt/previous-failure.txt (FAILED00001)",
        "Deferred:",
        "  src/transcripts/txt/upcoming-stream.txt (UPCOMING001): upcoming",
        "  src/transcripts/txt/missing-metadata.txt (MISSING0001): metadata_missing",
        "Failed: none",
        "Pending: none",
      ].join("\n"),
    );
    assert.equal(
      await readFile(join(root, "src/transcripts/txt/ready-one.txt"), "utf8"),
      "[0] 0:00\tTranscript READY000001.\n",
    );
    assert.equal(
      await readFile(join(root, "src/transcripts/txt/ready-two.txt"), "utf8"),
      "[0] 0:00\tTranscript READY000002.\n",
    );
    const manifest = JSON.parse(
      await readFile(join(root, "src/transcripts/manifest.json"), "utf8"),
    ) as TranscriptManifest;
    assert.deepEqual(
      manifest.transcripts.map((record) => record.videoId),
      ["STORED00001", "READY000001", "READY000002", "FAILED00001"],
    );
    const status = JSON.parse(
      await readFile(join(root, "src/transcripts/fetch-status.json"), "utf8"),
    ) as { failures: FetchFailure[] };
    assert.deepEqual(status.failures, []);
    assert.equal(
      await readFile(join(root, "src/channel/episodes.json"), "utf8"),
      episodeStoreBefore,
    );

    const rerun = await fetchTranscriptBatch({
      requestDelayMs: 0,
      fetcher: async () => {
        throw new Error("A rerun must not overwrite a valid stored TXT.");
      },
    });
    assert.equal(rerun.fetched, 0);
    assert.equal(rerun.storedSkipped, 4);
    assert.deepEqual(rerun.newTranscripts, []);
  });
});

test("partial failures checkpoint and remain eligible on an ordinary later run", async () => {
  const episodes = [
    episode("SUCCESS0001", "successful-transcript", 1),
    episode("CAPTION0001", "captions-not-ready", 2),
  ];
  await withFixture({
    episodes,
    metadata: episodes.map((record) => readyMetadata(record.videoId)),
  }, async (root) => {
    const episodeStoreBefore = await readFile(join(root, "src/channel/episodes.json"), "utf8");
    const first = await fetchTranscriptBatch({
      requestDelayMs: 0,
      fetcher: async (options) => {
        if (options.videoId === "CAPTION0001") {
          throw new TranscriptFetchError("Captions are not ready yet.", "no_caption_tracks");
        }
        return transcript(options.videoId);
      },
    });
    assert.equal(first.fetched, 1);
    assert.equal(first.failed, 1);
    assert.deepEqual(first.newTranscripts.map((record) => record.videoId), ["SUCCESS0001"]);
    assert.deepEqual(first.failureRecords, [{
      videoId: "CAPTION0001",
      path: "src/transcripts/txt/captions-not-ready.txt",
      classification: "no_caption_tracks",
      message: "Captions are not ready yet.",
    }]);
    assert.equal(
      await readFile(join(root, "src/transcripts/txt/successful-transcript.txt"), "utf8"),
      "[0] 0:00\tTranscript SUCCESS0001.\n",
    );
    const failedStatus = JSON.parse(
      await readFile(join(root, "src/transcripts/fetch-status.json"), "utf8"),
    ) as { failures: FetchFailure[] };
    assert.deepEqual(failedStatus.failures.map((failure) => failure.videoId), ["CAPTION0001"]);
    assert.equal(
      await readFile(join(root, "src/channel/episodes.json"), "utf8"),
      episodeStoreBefore,
    );

    let rerunCalls = 0;
    const rerun = await fetchTranscriptBatch({
      requestDelayMs: 0,
      fetcher: async (options) => {
        rerunCalls += 1;
        return transcript(options.videoId);
      },
    });
    assert.equal(rerunCalls, 1);
    assert.equal(rerun.fetched, 1);
    assert.equal(rerun.storedSkipped, 1);
    assert.deepEqual(rerun.newTranscripts.map((record) => record.videoId), ["CAPTION0001"]);
    const recoveredStatus = JSON.parse(
      await readFile(join(root, "src/transcripts/fetch-status.json"), "utf8"),
    ) as { failures: FetchFailure[] };
    assert.deepEqual(recoveredStatus.failures, []);
    const manifest = JSON.parse(
      await readFile(join(root, "src/transcripts/manifest.json"), "utf8"),
    ) as TranscriptManifest;
    assert.deepEqual(
      manifest.transcripts.map((record) => record.videoId),
      ["SUCCESS0001", "CAPTION0001"],
    );
  });
});

test("dry-run keeps known-unavailable records skipped and applies limits to the preview", async () => {
  const episodes = [
    episode("UNAVAIL0001", "known-unavailable-one", 1, "known-unavailable"),
    episode("UNAVAIL0002", "known-unavailable-two", 2, "known-unavailable"),
    episode("READY000003", "ready-three", 3),
    episode("READY000004", "ready-four", 4),
  ];
  await withFixture({
    episodes,
    metadata: episodes.map((record) => readyMetadata(record.videoId)),
  }, async (root) => {
    let calls = 0;
    const result = await fetchTranscriptBatch({
      requestDelayMs: 0,
      dryRun: true,
      limit: 1,
      fetcher: async (options) => {
        calls += 1;
        return transcript(options.videoId);
      },
    });
    assert.equal(calls, 0);
    assert.equal(result.unavailableSkipped, 2);
    assert.equal(result.pending, 2);
    assert.deepEqual(result.pendingRecords, [
      {
        videoId: "READY000003",
        path: "src/transcripts/txt/ready-three.txt",
        reason: "dry_run",
      },
      {
        videoId: "READY000004",
        path: "src/transcripts/txt/ready-four.txt",
        reason: "limit",
      },
    ]);
    const manifest = JSON.parse(
      await readFile(join(root, "src/transcripts/manifest.json"), "utf8"),
    ) as TranscriptManifest;
    assert.deepEqual(manifest.transcripts, []);
  });
});

test("blocking evidence stops requests but still reports the remaining batch state", async () => {
  const episodes = [
    episode("BLOCKED0001", "blocked-transcript", 1),
    episode("READY000005", "ready-after-block", 2),
    episode("UPCOMING002", "upcoming-after-block", 3),
  ];
  await withFixture({
    episodes,
    metadata: [
      readyMetadata("BLOCKED0001"),
      readyMetadata("READY000005"),
      {
        videoId: "UPCOMING002",
        fetchedAt: "2026-08-01T00:00:00.000Z",
        durationSeconds: 0,
        uploadStatus: "uploaded",
        liveBroadcastContent: "upcoming",
      },
    ],
  }, async () => {
    const calls: string[] = [];
    const result = await fetchTranscriptBatch({
      requestDelayMs: 0,
      fetcher: async (options) => {
        calls.push(options.videoId);
        throw new YoutubeRequestError(
          "YouTube returned blocking evidence.",
          "rate_limited_or_blocked",
          "120",
        );
      },
    });
    assert.deepEqual(calls, ["BLOCKED0001"]);
    assert.equal(result.blocked, true);
    assert.equal(result.failed, 1);
    assert.deepEqual(result.pendingRecords, [{
      videoId: "READY000005",
      path: "src/transcripts/txt/ready-after-block.txt",
      reason: "blocked",
    }]);
    assert.deepEqual(result.deferredRecords, [{
      videoId: "UPCOMING002",
      path: "src/transcripts/txt/upcoming-after-block.txt",
      reason: "upcoming",
    }]);
    assert.equal(result.failureRecords[0]?.retryAfter, "120");
  });
});

interface FixtureOptions {
  episodes: EpisodeRecord[];
  metadata: VideoMetadataRecord[];
  failures?: FetchFailure[];
  storedEpisodes?: EpisodeRecord[];
}

async function withFixture(
  options: FixtureOptions,
  action: (root: string) => Promise<void>,
): Promise<void> {
  const root = await mkdtemp(join(tmpdir(), "transcript-batch-"));
  const originalDirectory = process.cwd();
  try {
    await mkdir(join(root, "src/channel"), { recursive: true });
    await mkdir(join(root, "src/transcripts/txt"), { recursive: true });
    await writeJson(join(root, "src/channel/episodes.json"), {
      schemaVersion: 1,
      channel: {
        handleUrl: "https://www.youtube.com/@ancientegyptandthebible",
        channelId: "fixture-channel",
        uploadsPlaylistId: "fixture-uploads",
      },
      episodes: options.episodes,
    });
    await writeJson(join(root, "src/channel/video-metadata.json"), {
      schemaVersion: 1,
      source: { api: "youtube-data-api-v3" },
      videos: options.metadata,
    });
    await writeJson(join(root, "src/transcripts/fetch-status.json"), {
      schemaVersion: 1,
      failures: options.failures ?? [],
    });
    const storedRecords = [];
    for (const storedEpisode of options.storedEpisodes ?? []) {
      const text = "[0] 0:00\tStored transcript.\n";
      await writeFile(
        join(root, "src/transcripts/txt", `${storedEpisode.fileStem}.txt`),
        text,
        "utf8",
      );
      storedRecords.push(transcriptRecordFromText(
        storedEpisode,
        text,
        "legacy-json-bootstrap",
      ));
    }
    await writeJson(join(root, "src/transcripts/manifest.json"), {
      schemaVersion: 1,
      storage: {
        payload: "txt-only",
        pathTemplate: "txt/{fileStem}.txt",
        encoding: "utf8",
        lineEndings: "lf",
      },
      transcripts: storedRecords,
    } satisfies TranscriptManifest);

    process.chdir(root);
    await action(root);
  } finally {
    process.chdir(originalDirectory);
    await rm(root, { recursive: true, force: true });
  }
}

function episode(
  videoId: string,
  fileStem: string,
  order: number,
  transcriptPolicy: EpisodeRecord["transcriptPolicy"] = "expected",
): EpisodeRecord {
  return {
    videoId,
    url: `https://www.youtube.com/watch?v=${videoId}`,
    linkText: `Live Stream #${order}: ${fileStem}`,
    displayTitle: fileStem,
    episodeNumber: order,
    slug: fileStem,
    fileStem,
    order,
    transcriptPolicy,
  };
}

function readyMetadata(videoId: string): VideoMetadataRecord {
  return {
    videoId,
    fetchedAt: "2026-08-01T00:00:00.000Z",
    durationSeconds: 3_600,
    uploadStatus: "processed",
    liveBroadcastContent: "none",
  };
}

function transcript(videoId: string): VideoTranscript {
  return {
    videoId,
    source: "watch-page-captions",
    fetchedAt: "2026-08-01T00:00:00.000Z",
    selectedLanguage: "en",
    availableLanguages: ["en"],
    captionKind: "manual",
    segments: [{
      startSeconds: 0,
      durationSeconds: 1,
      text: `Transcript ${videoId}.`,
    }],
  };
}

async function writeJson(path: string, value: unknown): Promise<void> {
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}
