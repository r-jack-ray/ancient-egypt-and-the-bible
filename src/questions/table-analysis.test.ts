import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import { parseArgs } from "../scripts/check-question-tables.js";
import {
  analyzeQuestionTableText,
  questionTimeLabelToSeconds,
  resolveQuestionRepositoryRoot,
  splitMarkdownTableRowStrict,
} from "./table-analysis.js";

const validFourColumnPage = [
  "# Example",
  "",
  "| Time | Question | Short answer / answer direction | Expanded answer |",
  "|---|---|---|---|",
  "| <a href=\"https://youtu.be/abcdefghijk?t=62\" target=\"_blank\" rel=\"noopener noreferrer\">1:02</a> | What happened? | A short answer. | A longer transcript-grounded answer. |",
  "",
].join("\n");

test("strict table rows preserve escaped pipes inside cells", () => {
  assert.deepEqual(splitMarkdownTableRowStrict("| first \\| value | second |"), [
    "first \\| value",
    "second",
  ]);
  assert.throws(() => splitMarkdownTableRowStrict("first | second"), /complete Markdown table row/u);
});

test("four-column question tables validate timestamps and expanded answers", () => {
  const analysis = analyzeQuestionTableText(validFourColumnPage, "docs/questions/example.md", true);
  assert.equal(analysis.classification, "ordinaryFourColumn");
  assert.equal(analysis.headerLine, 3);
  assert.equal(analysis.rowCount, 1);
  assert.equal(analysis.completedExpandedAnswers, 1);
  assert.deepEqual(analysis.hardErrors, []);
});

test("legacy and pending expanded-answer policies match the old validator", () => {
  const threeColumn = validFourColumnPage
    .replace(" | Expanded answer |", " |")
    .replace("|---|---|---|---|", "|---|---|---|")
    .replace(" | A longer transcript-grounded answer. |", " |");
  assert.equal(
    analyzeQuestionTableText(threeColumn, "legacy.md", false).classification,
    "ordinaryThreeColumn",
  );
  const requiredLegacy = analyzeQuestionTableText(threeColumn, "legacy.md", true);
  assert.equal(requiredLegacy.classification, "malformed");
  assert.match(requiredLegacy.hardErrors[0] ?? "", /expected 4 with Expanded answer/u);

  const pending = validFourColumnPage.replace(
    "A longer transcript-grounded answer.",
    "_Expansion pending._",
  );
  assert.equal(analyzeQuestionTableText(pending, "pending.md", false).pendingExpandedAnswers, 1);
  assert.equal(analyzeQuestionTableText(pending, "pending.md", true).classification, "malformed");
});

test("special-format pages and malformed table-like pages remain distinguishable", () => {
  assert.equal(analyzeQuestionTableText("# Notes\n\nNo table.\n", "notes.md").classification, "specialFormat");
  const malformed = analyzeQuestionTableText("# Notes\n\n| incomplete\n", "broken.md");
  assert.equal(malformed.classification, "malformed");
  assert.equal(malformed.hardErrors.length, 1);
});

test("timestamp labels support minutes and hours and must match the link", () => {
  assert.equal(questionTimeLabelToSeconds("1:02"), 62);
  assert.equal(questionTimeLabelToSeconds("1:02:03"), 3_723);
  const mismatch = analyzeQuestionTableText(
    validFourColumnPage.replace("?t=62", "?t=63"),
    "mismatch.md",
    true,
  );
  assert.match(mismatch.hardErrors.join("\n"), /does not match \?t=63/u);
});

test("question-table CLI accepts repeatable kebab-case paths", () => {
  const options = parseArgs([
    "--path",
    "docs/questions/one.md",
    "--path",
    "docs/questions/two.md",
    "--allow-legacy-three-column",
  ]);
  assert.ok(options);
  assert.deepEqual(options.paths, ["docs/questions/one.md", "docs/questions/two.md"]);
  assert.equal(options.allowLegacyThreeColumn, true);
});

test("question repository root detection uses canonical Node-era markers", () => {
  const repoRoot = mkdtempSync(join(tmpdir(), "question-root-"));
  try {
    mkdirSync(join(repoRoot, "docs/questions"), { recursive: true });
    mkdirSync(join(repoRoot, "src/channel"), { recursive: true });
    writeFileSync(join(repoRoot, "package.json"), "{}\n", "utf8");
    writeFileSync(join(repoRoot, "src/channel/episodes.json"), "{}\n", "utf8");
    assert.equal(
      resolveQuestionRepositoryRoot("", [join(repoRoot, "docs/questions")]),
      repoRoot,
    );
  } finally {
    rmSync(repoRoot, { recursive: true, force: true });
  }
});
