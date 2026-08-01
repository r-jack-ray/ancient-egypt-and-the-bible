import assert from "node:assert/strict";
import { test } from "node:test";

import type { EpisodeRecord } from "../archive.js";
import {
  buildAcceptedInventoryEpisodes,
  episodeFromVideoMetadata,
  latestNumberedAddition,
} from "./inventory.js";

const baseline: EpisodeRecord = {
  videoId: "abcdefghijk",
  url: "https://www.youtube.com/watch?v=abcdefghijk",
  linkText: "Live Stream #271: Existing",
  displayTitle: "Existing",
  episodeNumber: 271,
  slug: "271-existing",
  fileStem: "271-existing",
  order: 1,
  lifecycle: "included",
  transcriptPolicy: "expected",
};

test("numbered inventory additions use the established archive identity shape", () => {
  const episode = episodeFromVideoMetadata({
    videoId: "8bF8Hm5NpR8",
    fetchedAt: "2026-08-01T16:45:58Z",
    title: "Live Stream #272: The Oppression Pharaoh, We Are Legion",
    uploadStatus: "processed",
  }, 2);
  assert.equal(episode.displayTitle, "The Oppression Pharaoh, We Are Legion");
  assert.equal(episode.episodeNumber, 272);
  assert.equal(episode.fileStem, "272-the-oppression-pharaoh-we-are-legion");
});

test("inventory apply includes only explicitly selected additions", () => {
  const latest = episodeFromVideoMetadata({
    videoId: "8bF8Hm5NpR8",
    fetchedAt: "2026-08-01T16:45:58Z",
    title: "Live Stream #272: Latest",
  }, 2);
  const unrelated = episodeFromVideoMetadata({
    videoId: "ZYXWVUTSRQP",
    fetchedAt: "2026-08-01T16:45:58Z",
    title: "Unrelated broadcast",
  }, 3);
  const episodes = buildAcceptedInventoryEpisodes(
      [baseline],
      [latest, unrelated],
      [latest.videoId],
  );
  assert.deepEqual(episodes.map((record) => record.videoId), [latest.videoId, baseline.videoId]);
  assert.deepEqual(episodes.map((record) => record.order), [1, 2]);
  assert.equal(episodes[1]?.slug, baseline.slug);
});

test("latest selection skips non-numbered broadcasts", () => {
  const unrelated = episodeFromVideoMetadata({
    videoId: "ZYXWVUTSRQP",
    fetchedAt: "2026-08-01T16:45:58Z",
    title: "Unrelated broadcast",
  }, 2);
  const latest = episodeFromVideoMetadata({
    videoId: "8bF8Hm5NpR8",
    fetchedAt: "2026-08-01T16:45:58Z",
    title: "Live Stream #272: Latest",
  }, 3);
  assert.equal(latestNumberedAddition([unrelated, latest])?.videoId, latest.videoId);
});

test("inventory apply rejects empty and unknown selections", () => {
  const latest = episodeFromVideoMetadata({
    videoId: "8bF8Hm5NpR8",
    fetchedAt: "2026-08-01T16:45:58Z",
    title: "Live Stream #272: Latest",
  }, 2);
  assert.throws(
      () => buildAcceptedInventoryEpisodes([baseline], [latest], []),
      /requires at least one/u,
  );
  assert.throws(
      () => buildAcceptedInventoryEpisodes([baseline], [latest], ["ZYXWVUTSRQP"]),
      /not proposed additions/u,
  );
});
