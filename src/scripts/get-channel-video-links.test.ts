import assert from "node:assert/strict";
import test from "node:test";
import type { InventoryCandidate } from "../youtube/inventory.js";
import { applySelectedInventoryCandidate, parseArgs } from "./get-channel-video-links.js";

test("livestream discovery applies canonical additions by default", () => {
  assert.deepEqual(parseArgs([]), {
    delayMs: 1_000,
    reviewOnly: false,
    acceptLatest: false,
    acceptedAdditionIds: [],
  });
});

test("livestream discovery makes a non-applying run explicit", () => {
  assert.deepEqual(parseArgs(["--review-only", "--max-pages", "1"]), {
    delayMs: 1_000,
    maxPages: 1,
    reviewOnly: true,
    acceptLatest: false,
    acceptedAdditionIds: [],
  });
});

test("livestream discovery rejects a partial default run", () => {
  assert.throws(
      () => parseArgs(["--max-pages", "1"]),
      /--max-pages requires --review-only/u,
  );
});

test("livestream discovery applies fresh metadata when there are no new episodes", async () => {
  const candidate: InventoryCandidate = {
    schemaVersion: 1,
    complete: true,
    source: {
      handleUrl: "https://www.youtube.com/@ancientegyptandthebible",
      channelId: "fixture-channel",
      uploadsPlaylistId: "fixture-uploads",
    },
    additions: [{
      videoId: "UNRELATED01",
      url: "https://www.youtube.com/watch?v=UNRELATED01",
      linkText: "An unnumbered side-series livestream",
      displayTitle: "An unnumbered side-series livestream",
      slug: "an-unnumbered-side-series-livestream",
      fileStem: "an-unnumbered-side-series-livestream",
      order: 289,
      transcriptPolicy: "expected",
    }],
    omittedBaselineVideoIds: [],
    titleChanges: [],
    excludedOrdinaryUploadIds: [],
    metadata: [{
      videoId: "to9KKIzyvxs",
      fetchedAt: "2026-08-15T06:00:00Z",
      liveBroadcastContent: "none",
      durationSeconds: 10_800,
      actualEndAt: "2026-08-15T05:59:00Z",
      uploadStatus: "processed",
    }],
  };
  let applied = false;
  const logs: string[] = [];

  await applySelectedInventoryCandidate(
      candidate,
      {acceptLatest: false, acceptedAdditionIds: []},
      {
        apply: async (received, options) => {
          applied = true;
          assert.equal(received, candidate);
          assert.deepEqual(options, {
            acceptSource: true,
            acceptedAdditionIds: [],
            allowEmptySelection: true,
          });
        },
        logger: (message) => logs.push(message),
      },
  );

  assert.equal(applied, true);
  assert.deepEqual(logs, [
    "No new numbered or special livestream is available; refreshing canonical metadata only.",
    "Refreshed canonical livestream metadata; episode inventory is unchanged.",
  ]);
});
