const assert = require("node:assert/strict");
const test = require("node:test");

const core = require("../site/assets/js/search-core.js");

const rows = [
  { id: "older", episode_number: 274, episode_order: 2, row_index: 1, start_seconds: 10 },
  { id: "unnumbered-2", episode_number: null, episode_order: 1, row_index: 2, start_seconds: 20 },
  { id: "newer", episode_number: 275, episode_order: 0, row_index: 1, start_seconds: 30 },
  { id: "unnumbered-1", episode_number: null, episode_order: 1, row_index: 1, start_seconds: 10 }
];

test("newest search results interleave unnumbered streams in archive order", () => {
  assert.deepEqual(rows.slice().sort(core.compareByNewest).map((row) => row.id), [
    "newer", "unnumbered-1", "unnumbered-2", "older"
  ]);
});

test("oldest search results reverse stream order while preserving question order", () => {
  assert.deepEqual(rows.slice().sort(core.compareByOldest).map((row) => row.id), [
    "older", "unnumbered-1", "unnumbered-2", "newer"
  ]);
});

test("timestamp sorting keeps each unnumbered stream together in archive order", () => {
  const laterStream = { id: "another-unnumbered", episode_number: null, episode_order: 3, row_index: 1, start_seconds: 5 };
  assert.deepEqual([...rows, laterStream].sort(core.compareByTime).map((row) => row.id), [
    "newer", "unnumbered-1", "unnumbered-2", "older", "another-unnumbered"
  ]);
});
