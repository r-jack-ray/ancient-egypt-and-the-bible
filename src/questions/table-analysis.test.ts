import assert from "node:assert/strict";
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import { main as checkQuestionTables, parseArgs } from "../scripts/check-question-tables.js";
import {
  analyzeQuestionTableText,
  parseQuestionTableText,
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
  const path = "docs/questions/example.md";
  const analysis = analyzeQuestionTableText(validFourColumnPage, path, true);
  assert.equal(analysis.classification, "ordinaryFourColumn");
  assert.equal(analysis.headerLine, 3);
  assert.equal(analysis.rowCount, 1);
  assert.equal(analysis.completedExpandedAnswers, 1);
  assert.deepEqual(analysis.hardErrors, []);

  const parsed = parseQuestionTableText(validFourColumnPage, path, true);
  assert.deepEqual(parsed.rows, [{
    lineNumber: 5,
    timeCell: "<a href=\"https://youtu.be/abcdefghijk?t=62\" target=\"_blank\" rel=\"noopener noreferrer\">1:02</a>",
    question: "What happened?",
    shortAnswer: "A short answer.",
    expandedAnswer: "A longer transcript-grounded answer.",
    timestamp: {
      href: "https://youtu.be/abcdefghijk?t=62",
      label: "1:02",
      startSeconds: 62,
    },
  }]);
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
    "--report",
  ]);
  assert.ok(options);
  assert.deepEqual(options.paths, ["docs/questions/one.md", "docs/questions/two.md"]);
  assert.equal(options.allowLegacyThreeColumn, true);
  assert.equal(options.report, true);
});

test("question-table CLI writes diagnostics only on failure or explicit request", () => {
  const repoRoot = mkdtempSync(join(tmpdir(), "question-report-"));
  const pagePath = join(repoRoot, "docs/questions/example.md");
  const jsonPath = join(repoRoot, "reports/question-table-validation.json");
  const markdownPath = join(repoRoot, "reports/question-table-validation.md");
  try {
    mkdirSync(join(repoRoot, "docs/questions"), { recursive: true });
    mkdirSync(join(repoRoot, "src/channel"), { recursive: true });
    writeFileSync(join(repoRoot, "package.json"), "{}\n", "utf8");
    writeFileSync(join(repoRoot, "src/channel/episodes.json"), "{}\n", "utf8");
    writeFileSync(pagePath, validFourColumnPage, "utf8");

    assert.equal(checkQuestionTables(["--repo-root", repoRoot]), 0);
    assert.equal(existsSync(jsonPath), false);
    assert.equal(existsSync(markdownPath), false);

    assert.equal(checkQuestionTables(["--repo-root", repoRoot, "--report"]), 0);
    assert.equal(existsSync(jsonPath), true);
    assert.equal(existsSync(markdownPath), true);
    rmSync(jsonPath, { force: true });
    rmSync(markdownPath, { force: true });

    writeFileSync(pagePath, validFourColumnPage.replace("?t=62", "?t=63"), "utf8");
    const errorOutput: string[] = [];
    const originalConsoleError = console.error;
    try {
      console.error = (...values: unknown[]) => {
        errorOutput.push(values.map(String).join(" "));
      };
      assert.equal(checkQuestionTables(["--repo-root", repoRoot]), 1);
    } finally {
      console.error = originalConsoleError;
    }
    assert.equal(existsSync(jsonPath), true);
    assert.match(readFileSync(markdownPath, "utf8"), /does not match \?t=63/u);
    assert.match(errorOutput.join("\n"), /does not match \?t=63/u);
  } finally {
    rmSync(repoRoot, { recursive: true, force: true });
  }
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
