import assert from "node:assert/strict";
import {existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {test} from "node:test";

import {main as checkQuestionWording, parseArgs} from "../scripts/check-question-wording.js";
import {
  scanQuestionTableMechanicalWording,
  visibleMarkdownText,
} from "./mechanical-wording.js";
import {parseQuestionTableText} from "./table-analysis.js";

test("visible Markdown text supports formatted mechanical phrases", () => {
  assert.equal(
      visibleMarkdownText("**Earlier** in [the transcript](https://example.test) &amp; notes"),
      "Earlier in the transcript & notes",
  );
});

test("mechanical wording rules distinguish high-confidence and review findings", () => {
  const parsed = parseQuestionTableText(questionPage(
      "**Earlier** in the transcript, the date was uncertain.",
      "The host explained that the date was uncertain.",
  ), "docs/questions/example.md", true);
  const findings = scanQuestionTableMechanicalWording(parsed);

  assert.deepEqual(
      findings.map(({cell, confidence, ruleId, match}) => ({cell, confidence, ruleId, match})),
      [
        {
          cell: "shortAnswer",
          confidence: "high",
          ruleId: "transcript-position-reference",
          match: "Earlier in the transcript",
        },
        {
          cell: "expandedAnswer",
          confidence: "review",
          ruleId: "routine-attribution-opening",
          match: "The host explained",
        },
      ],
  );
});

test("permitted uncertainty and meaningful personal attribution are not flagged", () => {
  const parsed = parseQuestionTableText(questionPage(
      "The transcript does not give a clear direct answer.",
      "He had not heard of it, so no evaluation was given.",
  ), "docs/questions/example.md", true);

  assert.deepEqual(scanQuestionTableMechanicalWording(parsed), []);
});

test("report-shaped answer and transcript frames remain explicit review targets", () => {
  const parsed = parseQuestionTableText(questionPage(
      "The answer says the name was rendered in the transcript.",
      "The transcript says the question asks for more than the segment answers.",
  ), "docs/questions/example.md", true);
  const findings = scanQuestionTableMechanicalWording(parsed);

  assert.deepEqual(
      findings.map(({confidence, ruleId}) => ({confidence, ruleId})),
      [
        {confidence: "review", ruleId: "answer-reporting-frame"},
        {confidence: "high", ruleId: "transcript-rendering-reference"},
        {confidence: "review", ruleId: "transcript-reporting-frame"},
        {confidence: "review", ruleId: "question-reporting-frame"},
      ],
  );
});

test("fuzzy review is opt-in and catches typo variants", () => {
  const parsed = parseQuestionTableText(questionPage(
      "Earler in the transcript, the date was uncertain.",
      "The date remains uncertain.",
  ), "docs/questions/example.md", true);

  assert.deepEqual(scanQuestionTableMechanicalWording(parsed), []);
  const findings = scanQuestionTableMechanicalWording(parsed, {includeFuzzy: true});
  assert.equal(findings.length, 1);
  assert.equal(findings[0]?.ruleId, "possible-mechanical-phrase-variant");
  assert.equal(findings[0]?.referencePhrase, "earlier in the transcript");
  assert.ok((findings[0]?.similarity ?? 0) >= 0.9);
});

test("question-wording CLI is report-only by default and strict on request", () => {
  const repoRoot = mkdtempSync(join(tmpdir(), "question-wording-"));
  const pagePath = join(repoRoot, "docs/questions/example.md");
  const jsonPath = join(repoRoot, "reports/question-wording-scan.json");
  const markdownPath = join(repoRoot, "reports/question-wording-scan.md");
  try {
    mkdirSync(join(repoRoot, "docs/questions"), {recursive: true});
    mkdirSync(join(repoRoot, "src/channel"), {recursive: true});
    writeFileSync(join(repoRoot, "package.json"), "{}\n", "utf8");
    writeFileSync(join(repoRoot, "src/channel/episodes.json"), "{}\n", "utf8");
    writeFileSync(pagePath, questionPage(
        "Earlier in the transcript, the date was uncertain.",
        "The date remains uncertain.",
    ), "utf8");

    assert.equal(withoutConsole(() => checkQuestionWording(["--repo-root", repoRoot])), 0);
    assert.equal(existsSync(jsonPath), false);
    assert.equal(withoutConsole(() => checkQuestionWording([
      "--repo-root",
      repoRoot,
      "--report",
    ])), 0);
    assert.equal(existsSync(jsonPath), true);
    assert.equal(existsSync(markdownPath), true);
    assert.match(readFileSync(jsonPath, "utf8"), /transcript-position-reference/u);
    assert.equal(withoutConsole(() => checkQuestionWording([
      "--repo-root",
      repoRoot,
      "--strict",
    ])), 1);
  } finally {
    rmSync(repoRoot, {recursive: true, force: true});
  }
});

test("question-wording CLI accepts scoped paths and fuzzy controls", () => {
  const options = parseArgs([
    "--path",
    "docs/questions/one.md",
    "--path",
    "docs/questions/two.md",
    "--fuzzy",
    "--fuzzy-threshold",
    "0.93",
    "--summary-only",
  ]);
  assert.ok(options);
  assert.deepEqual(options.paths, ["docs/questions/one.md", "docs/questions/two.md"]);
  assert.equal(options.fuzzy, true);
  assert.equal(options.fuzzyThreshold, 0.93);
  assert.equal(options.summaryOnly, true);
});

function questionPage(shortAnswer: string, expandedAnswer: string): string {
  return [
    "# Example",
    "",
    "| Time | Question | Short answer / answer direction | Expanded answer |",
    "|---|---|---|---|",
    `| <a href="https://youtu.be/abcdefghijk?t=62" target="_blank" rel="noopener noreferrer">1:02</a> | What happened? | ${shortAnswer} | ${expandedAnswer} |`,
    "",
  ].join("\n");
}

function withoutConsole<T>(operation: () => T): T {
  const originalLog = console.log;
  const originalError = console.error;
  try {
    console.log = () => undefined;
    console.error = () => undefined;
    return operation();
  } finally {
    console.log = originalLog;
    console.error = originalError;
  }
}
