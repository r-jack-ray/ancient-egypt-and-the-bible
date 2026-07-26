import assert from "node:assert/strict";
import { test } from "node:test";

import {
  archiveHeader,
  canonicalText,
  formatTimestamp,
  parseStreamIndex,
  renderStreamIndex,
  transcriptRecordFromText,
  validateTranscriptText,
} from "./archive.js";
import { assertPathInside } from "./pipeline/files.js";

test("stream index parses and renders exactly", () => {
  const markdown = [
    archiveHeader,
    "- [Live Stream #2: Example](https://www.youtube.com/watch?v=abcdefghijk) `2-example`",
    "- [Special Stream](https://www.youtube.com/watch?v=ZYXWVUTSRQP) `special-stream`",
    "",
  ].join("\n");
  const records = parseStreamIndex(markdown);
  assert.equal(records.length, 2);
  assert.equal(records[0]?.episodeNumber, 2);
  assert.equal(records[1]?.displayTitle, "Special Stream");
  assert.equal(renderStreamIndex(records), markdown);
});

test("TXT formatter timestamp contract supports hours", () => {
  assert.equal(formatTimestamp(8), "0:08");
  assert.equal(formatTimestamp(3_723), "1:02:03");
});

test("TXT validation accepts legacy CRLF but hashes canonical LF", () => {
  const lf = "[0] 0:01\tfirst\n[1] 1:02:03\tsecond\n";
  const crlf = lf.replace(/\n/gu, "\r\n");
  assert.deepEqual(validateTranscriptText(crlf), validateTranscriptText(lf));
  const episode = parseStreamIndex(
    `${archiveHeader}\n- [Live Stream #1: Test](https://www.youtube.com/watch?v=abcdefghijk) \`1-test\`\n`,
  )[0];
  assert.ok(episode);
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
