import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import {
  canonicalText,
  type EpisodeRecord,
  formatTimestamp,
  inventoryJournalPath,
  recoverInventoryTransaction,
  transcriptRecordFromText,
  validateTranscriptText,
} from "./archive.js";
import { assertPathInside } from "./pipeline/files.js";

test("TXT formatter timestamp contract supports hours", () => {
  assert.equal(formatTimestamp(8), "0:08");
  assert.equal(formatTimestamp(3_723), "1:02:03");
});

test("TXT validation accepts legacy CRLF but hashes canonical LF", () => {
  const lf = "[0] 0:01\tfirst\n[1] 1:02:03\tsecond\n";
  const crlf = lf.replace(/\n/gu, "\r\n");
  assert.deepEqual(validateTranscriptText(crlf), validateTranscriptText(lf));
  const episode = testEpisode();
  assert.equal(
    transcriptRecordFromText(episode, lf, "legacy-json-bootstrap").contentSha256,
    transcriptRecordFromText(episode, crlf, "legacy-json-bootstrap").contentSha256,
  );
});

test("TXT validation rejects discontinuous indexes and tabs in caption text", () => {
  assert.throws(() => validateTranscriptText("[1] 0:01\tbad\n"), /Invalid transcript row/u);
  assert.throws(() => validateTranscriptText("[0] 0:01\tbad\ttab\n"), /Invalid transcript row/u);
});

test("canonicalText removes BOM and normalizes line endings", () => {
  assert.equal(canonicalText("\uFEFFa\r\nb\r"), "a\nb\n");
});

test("owned transcript paths reject traversal", () => {
  assert.doesNotThrow(() => assertPathInside("src/transcripts/txt", "src/transcripts/txt/1-test.txt"));
  assert.throws(
    () => assertPathInside("src/transcripts/txt", "src/transcripts/json/escape.json"),
    /Path escapes owned root/u,
  );
});

test("inventory recovery rolls back a partial canonical two-file commit", async () => {
  const repoRoot = await mkdtemp(join(tmpdir(), "inventory-recovery-"));
  try {
    await mkdir(join(repoRoot, "src/channel"), { recursive: true });
    await mkdir(join(repoRoot, ".tmp/transcript-store"), { recursive: true });
    const previous = { episodes: "previous episodes\n", metadata: "previous metadata\n" };
    const proposed = { episodes: "proposed episodes\n", metadata: "proposed metadata\n" };
    await writeFile(join(repoRoot, "src/channel/episodes.json"), proposed.episodes, "utf8");
    await writeFile(join(repoRoot, "src/channel/video-metadata.json"), previous.metadata, "utf8");
    await writeFile(
      join(repoRoot, inventoryJournalPath),
      `${JSON.stringify({ schemaVersion: 1, phase: "prepared", previous, proposed }, null, 2)}\n`,
      "utf8",
    );

    assert.equal(await recoverInventoryTransaction(repoRoot), "rolled-back");
    assert.equal(await readFile(join(repoRoot, "src/channel/episodes.json"), "utf8"), previous.episodes);
    assert.equal(await readFile(join(repoRoot, "src/channel/video-metadata.json"), "utf8"), previous.metadata);
    await assert.rejects(readFile(join(repoRoot, inventoryJournalPath), "utf8"), /ENOENT/u);
  } finally {
    await rm(repoRoot, { recursive: true, force: true });
  }
});

test("inventory recovery completes when both canonical files match the proposal", async () => {
  const repoRoot = await mkdtemp(join(tmpdir(), "inventory-recovery-"));
  try {
    await mkdir(join(repoRoot, "src/channel"), { recursive: true });
    await mkdir(join(repoRoot, ".tmp/transcript-store"), { recursive: true });
    const previous = { episodes: "previous episodes\n", metadata: "previous metadata\n" };
    const proposed = { episodes: "proposed episodes\n", metadata: "proposed metadata\n" };
    await writeFile(join(repoRoot, "src/channel/episodes.json"), proposed.episodes, "utf8");
    await writeFile(join(repoRoot, "src/channel/video-metadata.json"), proposed.metadata, "utf8");
    await writeFile(
      join(repoRoot, inventoryJournalPath),
      `${JSON.stringify({ schemaVersion: 1, phase: "prepared", previous, proposed }, null, 2)}\n`,
      "utf8",
    );

    assert.equal(await recoverInventoryTransaction(repoRoot), "completed");
    assert.equal(await readFile(join(repoRoot, "src/channel/episodes.json"), "utf8"), proposed.episodes);
    assert.equal(await readFile(join(repoRoot, "src/channel/video-metadata.json"), "utf8"), proposed.metadata);
  } finally {
    await rm(repoRoot, { recursive: true, force: true });
  }
});

function testEpisode(): EpisodeRecord {
  return {
    videoId: "abcdefghijk",
    url: "https://www.youtube.com/watch?v=abcdefghijk",
    linkText: "Live Stream #1: Test",
    displayTitle: "Test",
    episodeNumber: 1,
    slug: "1-test",
    fileStem: "1-test",
    order: 1,
    transcriptPolicy: "expected",
  };
}
