import assert from "node:assert/strict";
import { test } from "node:test";

import {
  cleanCaptionText,
  extractJson3Segments,
  transcriptToText,
  type VideoTranscript,
} from "./transcripts.js";

test("direct transcript renderer preserves the repository TXT contract", () => {
  const transcript: VideoTranscript = {
    videoId: "abcdefghijk",
    source: "watch-page-captions",
    fetchedAt: "2026-07-25T00:00:00Z",
    selectedLanguage: "en",
    availableLanguages: ["en"],
    captionKind: "manual",
    segments: [
      { startSeconds: 1.9, durationSeconds: 2, text: " first\tsegment " },
      { startSeconds: 3_723.8, durationSeconds: 1, text: "second\nsegment" },
    ],
  };
  assert.equal(
    transcriptToText(transcript),
    "[0] 0:01\tfirst segment\n[1] 1:02:03\tsecond segment\n",
  );
});

test("json3 captions are parsed in memory without a JSON payload writer", () => {
  assert.deepEqual(
    extractJson3Segments({
      events: [
        { tStartMs: 1_500, dDurationMs: 2_000, segs: [{ utf8: "Hello " }, { utf8: "world" }] },
      ],
    }),
    [{ startSeconds: 1.5, durationSeconds: 2, text: "Hello world" }],
  );
});

test("caption cleanup removes markup, tabs, and line breaks", () => {
  assert.equal(cleanCaptionText("<b>A&amp;B</b>\r\nnext\tword"), "A&B next word");
});
