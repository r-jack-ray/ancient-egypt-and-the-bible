import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import { parseArgs } from "../scripts/report-question-revisions.js";
import {
  analyzeMarkdownQuality,
  buildRevisionCandidateReport,
  writeRevisionCandidateReports,
} from "./revision-candidates.js";

const timestamp = '<a href="https://youtu.be/abcdefghijk?t=62" target="_blank" rel="noopener noreferrer">1:02</a>';

test("revision quality analysis counts table, timestamp, expanded, and duplicate signals", () => {
  const markdown = [
    "| Time | Question | Short answer / answer direction | Expanded answer |",
    "|---|---|---|---|",
    `| ${timestamp} | What happened? | Short. | Expanded. |`,
    "| no link | What happened? | Short. | _Expansion pending._ |",
    "",
  ].join("\n");
  const quality = analyzeMarkdownQuality(markdown);
  assert.equal(quality.OrdinaryTableDetected, true);
  assert.equal(quality.QuestionCount, 2);
  assert.equal(quality.TimestampLinkCount, 1);
  assert.equal(quality.MissingTimestampLinkCount, 1);
  assert.equal(quality.CompletedExpandedAnswerCount, 1);
  assert.equal(quality.PendingExpandedAnswerCount, 1);
  assert.equal(quality.DuplicateQuestionCount, 1);
  assert.match(quality.DuplicateQuestionSamples, /^2x what happened\?$/u);
});

test("revision report pairs -questions Markdown with TXT and scores missing pairs", () => {
  const fixture = makeFixture();
  try {
    const report = buildRevisionCandidateReport({
      repoRoot: fixture,
      outputDir: "reports",
      largeTranscriptWordThreshold: 100_000,
    });
    const paired = report.candidates.find((candidate) => candidate.Slug === "1-example");
    assert.ok(paired);
    assert.equal(paired.MdExists, true);
    assert.equal(paired.TxtExists, true);
    assert.equal(paired.QuestionCount, 1);
    assert.equal(paired.CompletedExpandedAnswerCount, 1);

    const missing = report.candidates.find((candidate) => candidate.Slug === "2-missing");
    assert.ok(missing);
    assert.equal(missing.Priority, "Critical");
    assert.equal(missing.RevisionScore, 100);
    assert.equal(missing.Reasons, "Missing MD");

    writeRevisionCandidateReports(report, new Date("2026-08-01T12:34:56Z"));
    const csv = readFileSync(report.csvPath, "utf8");
    const markdown = readFileSync(report.markdownPath, "utf8");
    assert.match(csv, /^"EpisodeNumber","Slug","TriageCategory"/u);
    assert.match(csv, /"2-missing"/u);
    assert.match(markdown, /\| Critical \| 1 \|/u);
    assert.match(markdown, /\| Critical \| 2 \| 2-missing \| false \| true \| Missing MD \|/u);
  } finally {
    rmSync(fixture, { recursive: true, force: true });
  }
});

test("special streams skip density scoring unless explicitly enabled", () => {
  const fixture = makeFixture();
  try {
    const questionsDir = join(fixture, "docs", "questions");
    const transcriptsDir = join(fixture, "src", "transcripts", "txt");
    writeFileSync(
      join(questionsDir, "special-live-stream-demo-questions.md"),
      validQuestionPage(),
      "utf8",
    );
    writeFileSync(
      join(transcriptsDir, "special-live-stream-demo.txt"),
      `${"word ".repeat(1000)}\n`,
      "utf8",
    );
    const skipped = buildRevisionCandidateReport({ repoRoot: fixture }).candidates
      .find((candidate) => candidate.Slug === "special-live-stream-demo");
    assert.ok(skipped);
    assert.equal(skipped.DensityScoringSkipped, true);

    const scored = buildRevisionCandidateReport({
      repoRoot: fixture,
      scoreSpecialEpisodeDensity: true,
      largeTranscriptWordThreshold: 100,
    }).candidates.find((candidate) => candidate.Slug === "special-live-stream-demo");
    assert.ok(scored);
    assert.equal(scored.DensityScoringSkipped, false);
    assert.match(scored.Reasons, /Large transcript with low question count/u);
  } finally {
    rmSync(fixture, { recursive: true, force: true });
  }
});

test("revision CLI maps numeric kebab-case thresholds", () => {
  const options = parseArgs([
    "--large-transcript-word-threshold",
    "12000",
    "--low-questions-per-thousand-words-threshold",
    "1.5",
    "--score-special-episode-density",
  ]);
  assert.ok(options);
  assert.equal(options.largeTranscriptWordThreshold, 12_000);
  assert.equal(options.lowQuestionsPerThousandWordsThreshold, 1.5);
  assert.equal(options.scoreSpecialEpisodeDensity, true);
});

function makeFixture(): string {
  const root = mkdtempSync(join(tmpdir(), "question-revisions-"));
  const questionsDir = join(root, "docs", "questions");
  const transcriptsDir = join(root, "src", "transcripts", "txt");
  mkdirSync(questionsDir, { recursive: true });
  mkdirSync(transcriptsDir, { recursive: true });
  writeFileSync(join(transcriptsDir, "1-example.txt"), "one two three four\n", "utf8");
  writeFileSync(join(questionsDir, "1-example-questions.md"), validQuestionPage(), "utf8");
  writeFileSync(join(transcriptsDir, "2-missing.txt"), "missing markdown pair\n", "utf8");
  return root;
}

function validQuestionPage(): string {
  return [
    "# Example",
    "",
    "| Time | Question | Short answer / answer direction | Expanded answer |",
    "|---|---|---|---|",
    `| ${timestamp} | What happened? | Short. | Expanded transcript-grounded answer. |`,
    "",
  ].join("\n");
}
