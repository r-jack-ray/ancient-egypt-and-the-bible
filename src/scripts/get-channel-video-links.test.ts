import assert from "node:assert/strict";
import test from "node:test";
import { parseArgs } from "./get-channel-video-links.js";

test("livestream discovery applies the newest numbered addition by default", () => {
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
