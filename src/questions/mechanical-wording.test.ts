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
  const findings = scanQuestionTableMechanicalWording(parsed, {includeReview: true});

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

test("meaningful interpretive and disagreement attribution is preserved", () => {
  const parsed = parseQuestionTableText(questionPage(
      "In Falk's view, the reading best fits the imagery.",
      "Falk argues that the reading is stronger and rejects the proposed alternative.",
  ), "docs/questions/example.md", true);

  assert.deepEqual(scanQuestionTableMechanicalWording(parsed), []);
});

test("report-shaped answer and transcript frames are classified explicitly", () => {
  const parsed = parseQuestionTableText(questionPage(
      "The reply confirms the name was rendered in the transcript.",
      "The transcript says the question asks for more than the segment answers.",
  ), "docs/questions/example.md", true);
  const findings = scanQuestionTableMechanicalWording(parsed, {includeReview: true});

  assert.deepEqual(
      findings.map(({confidence, ruleId}) => ({confidence, ruleId})),
      [
        {confidence: "high", ruleId: "answer-reporting-frame"},
        {confidence: "high", ruleId: "transcript-rendering-reference"},
        {confidence: "high", ruleId: "transcript-reporting-frame"},
        {confidence: "review", ruleId: "question-reporting-frame"},
      ],
  );
});

test("conversation-position navigation is an actionable issue", () => {
  const parsed = parseQuestionTableText(questionPage(
      "Later in the discussion, Spinosaurus is named as the favorite.",
      "Spinosaurus is the favorite dinosaur.",
  ), "docs/questions/example.md", true);
  const findings = scanQuestionTableMechanicalWording(parsed, {includeReview: false});

  assert.deepEqual(
      findings.map(({confidence, ruleId, match}) => ({confidence, ruleId, match})),
      [{
        confidence: "high",
        ruleId: "conversation-position-reference",
        match: "Later in the discussion",
      }],
  );
});

test("subjectless yes-or-no answer continuations are actionable issues", () => {
  const parsed = parseQuestionTableText(questionPage(
      "Yes, several times, and recommends it as a must-see.",
      "Yes. He has visited several times and recommends it as a must-see.",
  ), "docs/questions/example.md", true);
  const findings = scanQuestionTableMechanicalWording(parsed);

  assert.deepEqual(
      findings.map(({cell, confidence, ruleId}) => ({cell, confidence, ruleId})),
      [{
        cell: "shortAnswer",
        confidence: "high",
        ruleId: "subjectless-personal-verb-after-yes-no",
      }],
  );
});

test("actionable-only scans omit judgment-required review candidates", () => {
  const parsed = parseQuestionTableText(questionPage(
      "The date remains uncertain.",
      "The host explained that the date was uncertain.",
  ), "docs/questions/example.md", true);

  assert.equal(scanQuestionTableMechanicalWording(parsed, {includeReview: true}).length, 1);
  assert.deepEqual(scanQuestionTableMechanicalWording(parsed), []);
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

test("question-wording CLI gates high-confidence and review findings separately", () => {
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
    assert.match(readFileSync(jsonPath, "utf8"), /Remove transcript-position navigation/u);
    assert.match(readFileSync(jsonPath, "utf8"), /Do not bulk-rewrite/u);
    assert.match(readFileSync(markdownPath, "utf8"), /## Actionable Issues/u);
    assert.equal(withoutConsole(() => checkQuestionWording([
      "--repo-root",
      repoRoot,
      "--strict",
    ])), 1);

    writeFileSync(pagePath, questionPage(
        "The date remains uncertain.",
        "The host explained that the date was uncertain.",
    ), "utf8");
    assert.equal(withoutConsole(() => checkQuestionWording([
      "--repo-root",
      repoRoot,
      "--strict",
    ])), 0);
    assert.equal(withoutConsole(() => checkQuestionWording([
      "--repo-root",
      repoRoot,
      "--strict-review",
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
    "--review",
    "--fuzzy",
    "--fuzzy-threshold",
    "0.93",
    "--strict-review",
    "--summary-only",
  ]);
  assert.ok(options);
  assert.deepEqual(options.paths, ["docs/questions/one.md", "docs/questions/two.md"]);
  assert.equal(options.review, true);
  assert.equal(options.fuzzy, true);
  assert.equal(options.fuzzyThreshold, 0.93);
  assert.equal(options.strictReview, true);
  assert.equal(options.summaryOnly, true);
});

test("question-wording CLI limits a strict scan to the supplied Markdown path", () => {
  const repoRoot = mkdtempSync(join(tmpdir(), "question-wording-scoped-"));
  const cleanRelativePath = "docs/questions/clean.md";
  const issueRelativePath = "docs/questions/issue.md";
  try {
    mkdirSync(join(repoRoot, "docs/questions"), {recursive: true});
    mkdirSync(join(repoRoot, "src/channel"), {recursive: true});
    writeFileSync(join(repoRoot, "package.json"), "{}\n", "utf8");
    writeFileSync(join(repoRoot, "src/channel/episodes.json"), "{}\n", "utf8");
    writeFileSync(join(repoRoot, cleanRelativePath), questionPage(
        "The date remains uncertain.",
        "The surviving evidence does not establish a precise date.",
    ), "utf8");
    writeFileSync(join(repoRoot, issueRelativePath), questionPage(
        "Earlier in the transcript, the date was uncertain.",
        "The date remains uncertain.",
    ), "utf8");

    assert.equal(withoutConsole(() => checkQuestionWording([
      "--repo-root",
      repoRoot,
      "--strict",
    ])), 1);
    assert.equal(withoutConsole(() => checkQuestionWording([
      "--repo-root",
      repoRoot,
      "--path",
      cleanRelativePath,
      "--strict",
    ])), 0);
    assert.equal(withoutConsole(() => checkQuestionWording([
      "--repo-root",
      repoRoot,
      "--path",
      issueRelativePath,
      "--strict",
    ])), 1);
  } finally {
    rmSync(repoRoot, {recursive: true, force: true});
  }
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
