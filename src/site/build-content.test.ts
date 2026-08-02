import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import { analyzeQuestionTableText } from "../questions/table-analysis.js";
import { buildHugoSiteContent } from "./build-content.js";

const validFourColumnPage = [
  "# Example questions",
  "",
  "Time links open the YouTube video at the relevant timestamp.",
  "",
  "| Time | Question | Short answer / answer direction | Expanded answer |",
  "|---|---|---|---|",
  "| <a href=\"https://youtu.be/abcdefghijk?t=62\" target=\"_blank\" rel=\"noopener noreferrer\">1:02</a> | What was the example? | A short answer. | A supported expanded answer. |",
  "",
].join("\n");

const invalidSharedTableFixtures = [
  {
    name: "invalid divider",
    markdown: validFourColumnPage.replace("|---|---|---|---|", "|---|---|invalid|---|"),
  },
  {
    name: "interrupted table",
    markdown: `${validFourColumnPage.trimEnd()}\nAdditional notes without a separating blank line.\n`,
  },
] as const;

async function writeSiteFixtureRepository(repoRoot: string, questionMarkdown: string): Promise<void> {
  await mkdir(join(repoRoot, "src/channel"), { recursive: true });
  await mkdir(join(repoRoot, "docs/questions"), { recursive: true });
  await mkdir(join(repoRoot, "site/content/questions"), { recursive: true });
  await writeFile(
    join(repoRoot, "src/channel/episodes.json"),
    `${JSON.stringify({
      schemaVersion: 1,
      channel: {
        handleUrl: "https://www.youtube.com/@ancientegyptandthebible",
        channelId: "channel-id",
        uploadsPlaylistId: "uploads-id",
      },
      episodes: [{
        videoId: "abcdefghijk",
        url: "https://www.youtube.com/watch?v=abcdefghijk",
        linkText: "Live Stream #1: Example",
        displayTitle: "Example",
        episodeNumber: 1,
        slug: "1-example",
        fileStem: "1-example",
        order: 1,
        transcriptPolicy: "expected",
      }],
    }, null, 2)}\n`,
    "utf8",
  );
  await writeFile(
    join(repoRoot, "docs/questions/1-example-questions.md"),
    questionMarkdown,
    "utf8",
  );
  await writeFile(join(repoRoot, "site/content/questions/_index.md"), "handwritten\n", "utf8");
  await writeFile(join(repoRoot, "site/content/questions/stale.md"), "stale\n", "utf8");
}

test("site content build generates deterministic data and preserves the handwritten index", async () => {
  const repoRoot = await mkdtemp(join(tmpdir(), "aeb-site-content-"));
  try {
    await writeSiteFixtureRepository(repoRoot, validFourColumnPage);

    const messages: string[] = [];
    const summary = await buildHugoSiteContent({
      repoRoot,
      buildSearchIndex: false,
      logger: (message) => messages.push(message),
    });

    assert.deepEqual(summary, {
      generatedPageCount: 1,
      numberedPageCount: 1,
      specialPageCount: 0,
      descriptionOverrideCount: 0,
      questionRowCount: 1,
    });
    assert.equal(await readFile(join(repoRoot, "site/content/questions/_index.md"), "utf8"), "handwritten\n");
    await assert.rejects(readFile(join(repoRoot, "site/content/questions/stale.md"), "utf8"), /ENOENT/u);

    const page = await readFile(join(repoRoot, "site/content/questions/1-example-questions.md"), "utf8");
    assert.match(page, /description_source: 'generated_from_questions'/u);
    assert.match(page, /description: 'Explore 1 transcript-grounded question from Example \(Live Stream #1\): "What was the example\?"'/u);
    assert.match(page, /episode_title: 'Example'/u);
    assert.match(page, /video_id: 'abcdefghijk'/u);
    assert.doesNotMatch(page, /What was the example\? \|/u);
    assert.equal(page.trimEnd().endsWith("---"), true);
    const episodes = JSON.parse(await readFile(join(repoRoot, "site/data/episodes.json"), "utf8")) as Record<string, unknown>[];
    const questions = JSON.parse(await readFile(join(repoRoot, "site/data/questions.json"), "utf8")) as unknown[];
    assert.equal(episodes.length, 1);
    assert.deepEqual(episodes[0], {
      number: 1,
      title: "Example",
      slug: "1-example",
      youtube_url: "https://www.youtube.com/watch?v=abcdefghijk",
      video_id: "abcdefghijk",
      question_page: "questions/1-example-questions.md",
      content_path: "questions/1-example/",
      status: "curated",
      is_numbered: true,
      is_special: false,
      question_count: 1,
      series: "numbered livestream",
    });
    assert.deepEqual(questions, [{
      episode_number: 1,
      episode_title: "Example",
      question_page: "questions/1-example-questions.md",
      content_path: "questions/1-example/",
      time_label: "1:02",
      start_seconds: 62,
      video_url: "https://youtu.be/abcdefghijk?t=62",
      question: "What was the example?",
      short_answer: "A short answer.",
      expanded_answer: "A supported expanded answer.",
      row_index: 1,
      is_numbered: true,
      is_special: false,
    }]);
    assert.ok(messages.includes("Question rows: 1"));
  } finally {
    await rm(repoRoot, { recursive: true, force: true });
  }
});

test("table analysis and site generation reject the same shared structural fixtures", async () => {
  for (const fixture of invalidSharedTableFixtures) {
    const repoRoot = await mkdtemp(join(tmpdir(), "aeb-shared-table-"));
    try {
      await writeSiteFixtureRepository(repoRoot, fixture.markdown);
      const sourcePath = join(repoRoot, "docs/questions/1-example-questions.md");
      const analysis = analyzeQuestionTableText(fixture.markdown, sourcePath, true);
      const firstError = analysis.hardErrors[0];
      assert.ok(firstError, `${fixture.name} must fail shared table analysis`);
      await assert.rejects(
        buildHugoSiteContent({ repoRoot, buildSearchIndex: false, logger: () => undefined }),
        (error: unknown) => {
          assert.ok(error instanceof Error);
          assert.equal(error.message, firstError);
          return true;
        },
      );
    } finally {
      await rm(repoRoot, { recursive: true, force: true });
    }
  }
});

test("site generation retains episode-specific video validation", async () => {
  const repoRoot = await mkdtemp(join(tmpdir(), "aeb-site-video-"));
  try {
    const wrongVideoPage = validFourColumnPage.replaceAll("abcdefghijk", "zyxwvutsrqp");
    await writeSiteFixtureRepository(repoRoot, wrongVideoPage);
    const analysis = analyzeQuestionTableText(wrongVideoPage, "wrong-video.md", true);
    assert.deepEqual(analysis.hardErrors, []);
    await assert.rejects(
      buildHugoSiteContent({ repoRoot, buildSearchIndex: false, logger: () => undefined }),
      /links to video 'zyxwvutsrqp', expected 'abcdefghijk'/u,
    );
  } finally {
    await rm(repoRoot, { recursive: true, force: true });
  }
});
