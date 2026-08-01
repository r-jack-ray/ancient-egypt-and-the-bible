import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import { validateHugoSearchAliases } from "./search-alias-validation.js";

test("search alias validation checks token aliases, phrase aliases, and expected matches", async () => {
  const repoRoot = await searchFixture();
  try {
    const messages: string[] = [];
    const summary = await validateHugoSearchAliases({
      repoRoot,
      maxRowsPerAliasGroup: 10,
      logger: (message) => messages.push(message),
    });
    assert.deepEqual(summary, {
      aliasGroupCount: 1,
      phraseAliasGroupCount: 1,
      questionRowCount: 2,
      queryTestCount: 2,
    });
    assert.deepEqual(messages.slice(-4), [
      "Alias groups: 1",
      "Phrase alias groups: 1",
      "Question rows: 2",
      "Query tests: 2",
    ]);
  } finally {
    await rm(repoRoot, { recursive: true, force: true });
  }
});

test("search alias validation enforces the broad-match ceiling", async () => {
  const repoRoot = await searchFixture();
  try {
    await assert.rejects(
      validateHugoSearchAliases({ repoRoot, maxRowsPerAliasGroup: 0, logger: () => undefined }),
      /Alias group \[pharaoh, pharoah\] matches 1 rows; limit is 0\./u,
    );
  } finally {
    await rm(repoRoot, { recursive: true, force: true });
  }
});

async function searchFixture(): Promise<string> {
  const repoRoot = await mkdtemp(join(tmpdir(), "aeb-search-aliases-"));
  await mkdir(join(repoRoot, "site/data"), { recursive: true });
  await writeFile(
    join(repoRoot, "site/data/search-aliases.json"),
    `${JSON.stringify({
      aliasGroups: [["pharaoh", "pharoah"]],
      phraseAliasGroups: [["dead sea scrolls", "dss"]],
      queryTests: [
        {
          query: "pharoah",
          minResults: 1,
          maxResults: 1,
          expectedMatches: [{ questionPage: "questions/example.md", questionContains: "Pharaoh" }],
        },
        { query: "dss", minResults: 1, maxResults: 1 },
      ],
    }, null, 2)}\n`,
    "utf8",
  );
  await writeFile(
    join(repoRoot, "site/data/questions.json"),
    `${JSON.stringify([
      {
        search_text: "Was Pharaoh connected to the Dead Sea Scrolls?",
        episode_title: "Example",
        question: "Was Pharaoh connected to the Dead Sea Scrolls?",
        short_answer: "No.",
        question_page: "questions/example.md",
        time_label: "1:00",
      },
      {
        search_text: "An unrelated archaeology question",
        episode_title: "Another",
        question: "What was found?",
        short_answer: "An artifact.",
        question_page: "questions/another.md",
        time_label: "2:00",
      },
    ], null, 2)}\n`,
    "utf8",
  );
  return repoRoot;
}
