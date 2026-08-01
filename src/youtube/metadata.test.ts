import assert from "node:assert/strict";
import { test } from "node:test";

import {
  parseYoutubeDuration,
  resolveVideoReadiness,
  selectMetadataRefreshVideoIds,
  type VideoMetadataRecord,
} from "./metadata.js";

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
