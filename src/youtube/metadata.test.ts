import assert from "node:assert/strict";
import { test } from "node:test";

import {
  fetchVideoMetadata,
  parseYoutubeDuration,
  resolveVideoReadiness,
  selectMetadataRefreshVideoIds,
  type VideoMetadataRecord,
} from "./metadata.js";

test("metadata fetch batches 50 IDs and preserves spacing and normalization", async () => {
  const ids = Array.from({ length: 101 }, (_value, index) => `video-${String(index).padStart(5, "0")}`);
  const requests: URL[] = [];
  const sleeps: number[] = [];
  const logs: string[] = [];
  const skippedId = ids[50];
  const mockFetch = (async (input: Parameters<typeof fetch>[0]) => {
    const url = new URL(String(input));
    requests.push(url);
    const requestedIds = url.searchParams.get("id")?.split(",") ?? [];
    return jsonResponse({
      items: requestedIds.map((videoId) => {
        if (videoId === skippedId) return { snippet: { title: "Missing ID" } };
        if (videoId === ids[0]) {
          return {
            id: videoId,
            snippet: {
              title: "Fixture title",
              publishedAt: "2026-08-01T00:00:00Z",
              liveBroadcastContent: "none",
            },
            contentDetails: { duration: "PT1H2M3S" },
            status: { privacyStatus: "public", uploadStatus: "processed" },
            liveStreamingDetails: {
              scheduledStartTime: "2026-08-01T00:00:00Z",
              actualStartTime: "2026-08-01T00:01:00Z",
              actualEndTime: "2026-08-01T01:01:00Z",
            },
          };
        }
        return { id: videoId };
      }),
    });
  }) as typeof fetch;

  const records = await fetchVideoMetadata({
    apiKey: "fixture-key",
    videoIds: ids,
    delayMs: 250,
    fetch: mockFetch,
    sleep: async (milliseconds) => {
      sleeps.push(milliseconds);
    },
    now: () => new Date("2026-08-01T12:34:56Z"),
    logger: (message) => logs.push(message),
  });

  assert.deepEqual(requests.map((url) => url.searchParams.get("id")?.split(",").length), [50, 50, 1]);
  assert.deepEqual(requests.map((url) => url.searchParams.get("maxResults")), ["50", "50", "1"]);
  assert.deepEqual(sleeps, [250, 250]);
  assert.deepEqual(logs, [
    "Fetching YouTube metadata 1-50.",
    "Fetching YouTube metadata 51-100.",
    "Fetching YouTube metadata 101-101.",
  ]);
  assert.equal(records.length, 100);
  assert.ok(!records.some((record) => record.videoId === skippedId));
  assert.deepEqual(records[0], {
    videoId: ids[0],
    fetchedAt: "2026-08-01T12:34:56.000Z",
    title: "Fixture title",
    publishedAt: "2026-08-01T00:00:00Z",
    durationSeconds: 3_723,
    liveBroadcastContent: "none",
    scheduledStartAt: "2026-08-01T00:00:00Z",
    actualStartAt: "2026-08-01T00:01:00Z",
    actualEndAt: "2026-08-01T01:01:00Z",
    privacyStatus: "public",
    uploadStatus: "processed",
  });
});

test("metadata readiness defers scheduled, live, and processing streams", () => {
  const base: VideoMetadataRecord = {
    videoId: "abcdefghijk",
    fetchedAt: "2026-07-25T00:00:00Z",
    durationSeconds: 100,
    uploadStatus: "processed",
  };
  assert.deepEqual(
    resolveVideoReadiness({ ...base, liveBroadcastContent: "upcoming" }),
    { state: "deferred", reason: "upcoming" },
  );
  assert.deepEqual(
    resolveVideoReadiness({ ...base, liveBroadcastContent: "live" }),
    { state: "deferred", reason: "live_in_progress" },
  );
  assert.deepEqual(
    resolveVideoReadiness({ ...base, uploadStatus: "uploaded" }),
    { state: "deferred", reason: "processing" },
  );
});

test("completed stream needs independent end evidence", () => {
  const stream: VideoMetadataRecord = {
    videoId: "abcdefghijk",
    fetchedAt: "2026-07-25T00:00:00Z",
    durationSeconds: 100,
    uploadStatus: "processed",
    scheduledStartAt: "2026-07-25T00:00:00Z",
    actualStartAt: "2026-07-25T00:01:00Z",
  };
  assert.deepEqual(
    resolveVideoReadiness(stream),
    { state: "deferred", reason: "completion_unconfirmed" },
  );
  assert.deepEqual(
    resolveVideoReadiness({ ...stream, actualEndAt: "2026-07-25T01:00:00Z" }),
    { state: "ready" },
  );
});

test("ISO 8601 YouTube durations are normalized", () => {
  assert.equal(parseYoutubeDuration("PT1H2M3S"), 3_723);
  assert.equal(parseYoutubeDuration("PT0S"), 0);
  assert.equal(parseYoutubeDuration("invalid"), undefined);
});

test("metadata refresh includes missing and changing schedule records", () => {
  const ready: VideoMetadataRecord = {
    videoId: "abcdefghijk",
    fetchedAt: "2026-08-01T00:00:00Z",
    durationSeconds: 100,
    uploadStatus: "processed",
  };
  const upcoming: VideoMetadataRecord = {
    videoId: "ZYXWVUTSRQP",
    fetchedAt: "2026-08-01T00:00:00Z",
    durationSeconds: 0,
    uploadStatus: "uploaded",
    liveBroadcastContent: "upcoming",
    scheduledStartAt: "2026-08-02T00:00:00Z",
  };
  const ids = [ready.videoId, upcoming.videoId, "12345678901"];
  assert.deepEqual(
    selectMetadataRefreshVideoIds(ids, [ready, upcoming]),
    [upcoming.videoId, "12345678901"],
  );
  assert.deepEqual(
    selectMetadataRefreshVideoIds(ids, [ready, upcoming], { refreshAll: true, limit: 2 }),
    [ready.videoId, upcoming.videoId],
  );
});

function jsonResponse(value: unknown): Response {
  return new Response(JSON.stringify(value), {
    headers: { "content-type": "application/json" },
  });
}
