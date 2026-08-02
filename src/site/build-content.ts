import { spawn } from "node:child_process";
import { readdir, readFile, rm, stat } from "node:fs/promises";
import { basename, join, relative, resolve, sep } from "node:path";

import { episodesPath, readEpisodesStore } from "../archive.js";
import { atomicWriteJson, atomicWriteText } from "../pipeline/files.js";

export interface BuildHugoSiteContentOptions {
  repoRoot?: string;
  buildSearchIndex?: boolean;
  logger?: (message: string) => void;
}

export interface BuildHugoSiteContentSummary {
  generatedPageCount: number;
  numberedPageCount: number;
  specialPageCount: number;
  descriptionOverrideCount: number;
  questionRowCount: number;
}

interface EpisodeData {
  number: number | null;
  title: string;
  slug: string;
  youtube_url: string | null;
  video_id: string | null;
  question_page: string | null;
  content_path: string | null;
  status: "curated" | "missing_question_page";
  is_numbered: boolean;
  is_special: boolean;
  question_count: number;
  series: string;
}

interface PageMetadata {
  number: number | null;
  title: string;
  slug: string;
  video_id: string | null;
  question_page: string;
  content_path: string;
  is_numbered: boolean;
  is_special: boolean;
  series: string;
}

interface QuestionRow {
  episode_number: number | null;
  episode_title: string;
  question_page: string;
  content_path: string;
  time_label: string;
  start_seconds: number;
  video_url: string;
  question: string;
  short_answer: string;
  expanded_answer: string;
  row_index: number;
  is_numbered: boolean;
  is_special: boolean;
}

export async function buildHugoSiteContent(
  options: BuildHugoSiteContentOptions = {},
): Promise<BuildHugoSiteContentSummary> {
  const repoRoot = resolve(options.repoRoot ?? resolve(__dirname, "../.."));
  const logger = options.logger ?? console.log;
  const episodeStorePath = join(repoRoot, episodesPath);
  const questionsSourceDir = join(repoRoot, "docs/questions");
  const siteDir = join(repoRoot, "site");
  const siteDataDir = join(siteDir, "data");
  const siteQuestionsDir = join(siteDir, "content/questions");

  await requireFile(episodeStorePath);
  await requireDirectory(questionsSourceDir);

  const questionFileNames = (await readdir(questionsSourceDir, { withFileTypes: true }))
    .filter((entry) => entry.isFile() && entry.name.endsWith(".md"))
    .map((entry) => entry.name)
    .sort(compareOrdinal);
  if (questionFileNames.length === 0) {
    throw new Error(`No Markdown files found under ${questionsSourceDir}.`);
  }

  const questionFileNameSet = new Set(questionFileNames);
  const archiveEpisodes = (await readEpisodesStore(episodeStorePath)).episodes;
  if (archiveEpisodes.length === 0) {
    throw new Error(`No episodes found in ${episodeStorePath}.`);
  }

  const episodes: EpisodeData[] = [];
  const episodesByNumber = new Map<number, EpisodeData>();
  const episodesBySlug = new Map<string, EpisodeData>();
  for (const archiveEpisode of archiveEpisodes) {
    const expectedQuestionPage = questionPageNameForSlug(archiveEpisode.slug);
    const hasQuestionPage = questionFileNameSet.has(expectedQuestionPage);
    const isNumbered = archiveEpisode.episodeNumber !== undefined;
    const episode: EpisodeData = {
      number: archiveEpisode.episodeNumber ?? null,
      title: archiveEpisode.displayTitle,
      slug: archiveEpisode.slug,
      youtube_url: archiveEpisode.url,
      video_id: archiveEpisode.videoId,
      question_page: hasQuestionPage ? `questions/${expectedQuestionPage}` : null,
      content_path: hasQuestionPage ? `questions/${archiveEpisode.slug}/` : null,
      status: hasQuestionPage ? "curated" : "missing_question_page",
      is_numbered: isNumbered,
      is_special: !isNumbered,
      question_count: 0,
      series: seriesForEpisode(archiveEpisode.slug, isNumbered),
    };
    episodes.push(episode);
    episodesBySlug.set(episode.slug, episode);
    if (episode.number !== null) {
      episodesByNumber.set(episode.number, episode);
    }
  }

  await removeGeneratedQuestionPages(siteQuestionsDir);

  const allQuestionRows: QuestionRow[] = [];
  const pageDescriptions = new Set<string>();
  let numberedPageCount = 0;
  let specialPageCount = 0;
  let descriptionOverrideCount = 0;

  for (const fileName of questionFileNames) {
    const sourcePath = join(questionsSourceDir, fileName);
    const sourceRelativePath = repoRelativePath(repoRoot, sourcePath);
    const sourceText = normalizeLineEndings(await readFile(sourcePath, "utf8"));
    const lines = splitFileLines(sourceText);
    const baseName = basename(fileName, ".md");
    const pageTitle = pageTitleFromMarkdown(lines, baseName);
    const pageIntro = pageDescriptionFromMarkdown(lines, pageTitle);

    let pageMetadata: PageMetadata;
    const numberedMatch = /^(\d+)-/u.exec(baseName);
    if (numberedMatch?.[1] !== undefined) {
      const number = Number(numberedMatch[1]);
      const episode = episodesByNumber.get(number);
      if (episode === undefined) {
        throw new Error(
          `${sourcePath} starts with episode number ${number}, but no matching entry exists in ${episodesPath}.`,
        );
      }
      pageMetadata = {
        number,
        title: episode.title,
        slug: episode.slug,
        video_id: episode.video_id,
        question_page: `questions/${fileName}`,
        content_path: `questions/${episode.slug}/`,
        is_numbered: true,
        is_special: false,
        series: "numbered livestream",
      };
      numberedPageCount += 1;
    } else {
      const slug = baseName.endsWith("-questions")
        ? baseName.slice(0, -"-questions".length)
        : baseName;
      let episode = episodesBySlug.get(slug);
      pageMetadata = {
        number: null,
        title: episode?.title ?? pageIntro,
        slug,
        video_id: episode?.video_id ?? null,
        question_page: `questions/${fileName}`,
        content_path: `questions/${slug}/`,
        is_numbered: false,
        is_special: true,
        series: seriesForEpisode(slug, false),
      };
      specialPageCount += 1;

      if (episode === undefined) {
        episode = {
          number: null,
          title: pageMetadata.title,
          slug,
          youtube_url: null,
          video_id: null,
          question_page: `questions/${fileName}`,
          content_path: `questions/${slug}/`,
          status: "curated",
          is_numbered: false,
          is_special: true,
          question_count: 0,
          series: pageMetadata.series,
        };
        episodes.push(episode);
        episodesBySlug.set(slug, episode);
      }
    }

    const rows = questionRowsFromMarkdown(lines, sourcePath, pageMetadata);
    allQuestionRows.push(...rows);

    const descriptionOverride = pageDescriptionOverrideFromMarkdown(lines, sourceRelativePath);
    const descriptionSource = descriptionOverride === null
      ? "generated_from_questions"
      : "curated_override";
    const pageDescription = descriptionOverride ?? newQuestionPageDescription(pageMetadata, rows);
    if (descriptionOverride !== null) {
      descriptionOverrideCount += 1;
    }

    const descriptionKey = pageDescription.replace(/\s+/gu, " ").trim().toLowerCase();
    if (pageDescriptions.has(descriptionKey)) {
      throw new Error(`Generated duplicate page description for ${sourceRelativePath}.`);
    }
    pageDescriptions.add(descriptionKey);

    const matchingEpisode = episodesBySlug.get(pageMetadata.slug);
    if (matchingEpisode === undefined) {
      throw new Error(`No generated episode record for ${pageMetadata.slug}.`);
    }
    matchingEpisode.question_page = `questions/${fileName}`;
    matchingEpisode.content_path = pageMetadata.content_path;
    matchingEpisode.status = "curated";
    matchingEpisode.question_count = rows.length;

    const frontMatter = [
      "---",
      `title: ${yamlScalar(pageTitle)}`,
      `description: ${yamlScalar(pageDescription)}`,
      `description_source: ${yamlScalar(descriptionSource)}`,
      `source_file: ${yamlScalar(sourceRelativePath)}`,
      `episode_number: ${yamlScalar(pageMetadata.number)}`,
      `episode_title: ${yamlScalar(pageMetadata.title)}`,
      `slug: ${yamlScalar(pageMetadata.slug)}`,
      `video_id: ${yamlScalar(pageMetadata.video_id)}`,
      `question_page: ${yamlScalar(pageMetadata.question_page)}`,
      `question_count: ${rows.length}`,
      `is_numbered: ${yamlScalar(pageMetadata.is_numbered)}`,
      `is_special: ${yamlScalar(pageMetadata.is_special)}`,
      `series: ${yamlScalar(pageMetadata.series)}`,
      `sort_key: ${pageMetadata.is_numbered ? pageMetadata.number : 0}`,
      "generated_from_docs_questions: true",
      "---",
    ];
    await atomicWriteText(join(siteQuestionsDir, fileName), ensureLf(frontMatter.join("\n")));
  }

  const generatedPageCount = await countGeneratedQuestionPages(siteQuestionsDir);
  if (generatedPageCount !== questionFileNames.length) {
    throw new Error(`Generated ${generatedPageCount} question pages, expected ${questionFileNames.length}.`);
  }

  await atomicWriteJson(join(siteDataDir, "episodes.json"), episodes);
  await atomicWriteJson(join(siteDataDir, "questions.json"), allQuestionRows);

  if (options.buildSearchIndex !== false) {
    await runSearchIndexBuilder(repoRoot);
  }

  const summary: BuildHugoSiteContentSummary = {
    generatedPageCount,
    numberedPageCount,
    specialPageCount,
    descriptionOverrideCount,
    questionRowCount: allQuestionRows.length,
  };
  logger(`Generated ${summary.generatedPageCount} Hugo question pages from docs/questions.`);
  logger(`Numbered pages: ${summary.numberedPageCount}`);
  logger(`Special pages: ${summary.specialPageCount}`);
  logger(`Description overrides: ${summary.descriptionOverrideCount}`);
  logger(`Question rows: ${summary.questionRowCount}`);
  logger("Wrote site/data/episodes.json, site/data/questions.json, and site/static/search/.");
  return summary;
}

function questionRowsFromMarkdown(
  lines: readonly string[],
  path: string,
  pageMetadata: PageMetadata,
): QuestionRow[] {
  const tableStart = lines.findIndex((line) =>
    /^\|\s*Time\s*\|\s*Question\s*\|\s*Short answer \/ answer direction\s*\|\s*Expanded answer\s*\|\s*$/u.test(line)
  );
  if (tableStart < 0) {
    throw new Error(`Missing four-column Q&A table header in ${path}.`);
  }
  const separatorPattern = /^\|\s*:?-{3,}:?\s*\|\s*:?-{3,}:?\s*\|\s*:?-{3,}:?\s*\|\s*:?-{3,}:?\s*\|\s*$/u;
  const separatorLine = lines[tableStart + 1];
  if (separatorLine === undefined || !separatorPattern.test(separatorLine)) {
    throw new Error(`${path}:${tableStart + 2} is not a valid 4-column table separator.`);
  }

  const rows: QuestionRow[] = [];
  for (let index = tableStart + 2; index < lines.length; index += 1) {
    const line = lines[index];
    if (line === undefined || line.trim().length === 0) {
      break;
    }
    if (!line.trimStart().startsWith("|")) {
      throw new Error(`${path}:${index + 1} interrupts the Q&A table.`);
    }
    const cells = splitMarkdownTableRow(line, path, index + 1);
    if (cells.length !== 4) {
      throw new Error(`${path}:${index + 1} has ${cells.length} cells; expected 4.`);
    }
    const [timeCell = "", question = "", shortAnswer = "", expandedAnswer = ""] = cells;
    if (!question.trim() || !shortAnswer.trim()) {
      throw new Error(`${path}:${index + 1} has an empty question or answer cell.`);
    }
    if (!expandedAnswer.trim()) {
      throw new Error(`${path}:${index + 1} has an empty expanded answer cell.`);
    }
    if (/_Expansion pending\._/u.test(expandedAnswer)) {
      throw new Error(`${path}:${index + 1} has a pending expanded answer placeholder.`);
    }

    const anchor = /<a\s+href="(?<href>https:\/\/(?:youtu\.be\/[^"?]+|www\.youtube\.com\/watch\?[^"]+)[^"]*[?&]t=(?<seconds>\d+)[^"]*)"\s+target="_blank"\s+rel="noopener noreferrer">(?<label>[^<]+)<\/a>/u.exec(timeCell);
    const href = anchor?.groups?.href;
    const seconds = anchor?.groups?.seconds;
    const label = anchor?.groups?.label;
    if (href === undefined || seconds === undefined || label === undefined) {
      throw new Error(`${path}:${index + 1} has a malformed timestamp anchor.`);
    }
    const startSeconds = Number(seconds);
    const labelSeconds = timeLabelToSeconds(label);
    if (startSeconds !== labelSeconds) {
      throw new Error(`${path}:${index + 1} timestamp label '${label}' does not match ?t=${startSeconds}.`);
    }
    const rowVideoId = videoIdFromUrl(href);
    if (pageMetadata.video_id !== null && rowVideoId !== pageMetadata.video_id) {
      throw new Error(
        `${path}:${index + 1} links to video '${rowVideoId}', expected '${pageMetadata.video_id}'.`,
      );
    }
    rows.push({
      episode_number: pageMetadata.number,
      episode_title: pageMetadata.title,
      question_page: pageMetadata.question_page,
      content_path: pageMetadata.content_path,
      time_label: label,
      start_seconds: startSeconds,
      video_url: href,
      question,
      short_answer: shortAnswer,
      expanded_answer: expandedAnswer,
      row_index: rows.length + 1,
      is_numbered: pageMetadata.is_numbered,
      is_special: pageMetadata.is_special,
    });
  }
  if (rows.length === 0) {
    throw new Error(`No question rows found in ${path}.`);
  }
  return rows;
}

function splitMarkdownTableRow(line: string, path: string, lineNumber: number): string[] {
  const trimmed = line.trim();
  if (!trimmed.startsWith("|") || !trimmed.endsWith("|")) {
    throw new Error(`${path}:${lineNumber} is not a complete Markdown table row.`);
  }
  const cells: string[] = [];
  let current = "";
  let escaped = false;
  for (const character of trimmed.slice(1, -1)) {
    if (escaped) {
      current += character;
      escaped = false;
    } else if (character === "\\") {
      current += character;
      escaped = true;
    } else if (character === "|") {
      cells.push(current.trim());
      current = "";
    } else {
      current += character;
    }
  }
  cells.push(current.trim());
  return cells;
}

function pageTitleFromMarkdown(lines: readonly string[], fallback: string): string {
  for (const line of lines) {
    const match = /^#\s+(.+?)\s*$/u.exec(line);
    if (match?.[1] !== undefined) {
      return match[1];
    }
  }
  return fallback;
}

function pageDescriptionFromMarkdown(lines: readonly string[], fallback: string): string {
  for (const line of lines) {
    const trimmed = line.trim();
    if (
      !trimmed ||
      trimmed.startsWith("#") ||
      trimmed.startsWith("<!--") ||
      trimmed === "Time links open the YouTube video at the relevant timestamp."
    ) {
      continue;
    }
    if (trimmed.startsWith("|")) {
      break;
    }
    return trimmed;
  }
  return fallback;
}

function pageDescriptionOverrideFromMarkdown(lines: readonly string[], path: string): string | null {
  let override: string | null = null;
  for (const line of lines) {
    const match = /^\s*<!--\s*seo-description\s*:\s*(.*?)\s*-->\s*$/u.exec(line);
    if (match?.[1] !== undefined) {
      if (override !== null) {
        throw new Error(`${path} contains more than one seo-description override.`);
      }
      override = plainDescriptionText(match[1]);
      if (!override.trim()) {
        throw new Error(`${path} contains an empty seo-description override.`);
      }
    } else if (/^\s*<!--\s*seo-description\b/u.test(line)) {
      throw new Error(
        `${path} contains a malformed seo-description override. Use: <!-- seo-description: Concise page description. -->`,
      );
    }
  }
  return override;
}

function newQuestionPageDescription(pageMetadata: PageMetadata, rows: readonly QuestionRow[]): string {
  if (rows.length === 0) {
    throw new Error("Cannot generate a page description without curated question rows.");
  }
  const episodeTitle = plainDescriptionText(pageMetadata.title).replace(/\.+$/u, "");
  if (!episodeTitle.trim()) {
    throw new Error("Cannot generate a page description without an episode title.");
  }
  const sourceLabel = pageMetadata.is_numbered
    ? `${episodeTitle} (Live Stream #${pageMetadata.number})`
    : episodeTitle;
  const topics = representativeDescriptionTopics(rows);
  const questionLabel = rows.length === 1 ? "question" : "questions";
  if (topics.length === 1) {
    return `Explore ${rows.length} transcript-grounded ${questionLabel} from ${sourceLabel}: "${topics[0]}"`;
  }
  return `Explore ${rows.length} transcript-grounded ${questionLabel} from ${sourceLabel}, including "${topics[0]}" and "${topics[1]}"`;
}

function representativeDescriptionTopics(rows: readonly QuestionRow[], maximumLength = 88): string[] {
  const targets = rows.length === 1
    ? [0]
    : rows.length === 2
      ? [0, 1]
      : [Math.floor(rows.length / 3), Math.floor((rows.length * 2) / 3)];
  const selected = new Set<number>();
  const topics: string[] = [];
  for (const target of targets) {
    const candidates = rows.map((_, index) => index).sort((left, right) => {
      const distance = Math.abs(left - target) - Math.abs(right - target);
      return distance === 0 ? left - right : distance;
    });
    let fallback: { index: number; topic: string } | undefined;
    let added = false;
    for (const candidate of candidates) {
      if (selected.has(candidate)) continue;
      const row = rows[candidate];
      if (row === undefined) continue;
      const topic = plainDescriptionText(row.question);
      if (!topic.trim()) continue;
      fallback ??= { index: candidate, topic };
      if (topic.length <= maximumLength) {
        selected.add(candidate);
        topics.push(topic);
        added = true;
        break;
      }
    }
    if (!added) {
      if (fallback === undefined) {
        throw new Error("Could not select a representative question for the generated page description.");
      }
      selected.add(fallback.index);
      topics.push(limitDescriptionText(fallback.topic, maximumLength));
    }
  }
  return topics;
}

function plainDescriptionText(text: string): string {
  return decodeHtmlEntities(
    text
      .replace(/<[^>]+>/gu, " ")
      .replace(/\[([^\]]+)\]\([^)]+\)/gu, "$1")
      .replace(/[*_~]/gu, "")
      .replace(/`/gu, ""),
  ).replace(/\s+/gu, " ").trim().replaceAll('"', "'");
}

function decodeHtmlEntities(text: string): string {
  const named: Readonly<Record<string, string>> = {
    amp: "&",
    apos: "'",
    gt: ">",
    lt: "<",
    nbsp: "\u00a0",
    quot: '"',
  };
  return text.replace(/&(?:#(?<decimal>\d+)|#x(?<hex>[0-9a-f]+)|(?<named>[a-z]+));/giu, (entity, ...args: unknown[]) => {
    const groups = args.at(-1) as { decimal?: string; hex?: string; named?: string } | undefined;
    if (groups?.decimal !== undefined) return String.fromCodePoint(Number(groups.decimal));
    if (groups?.hex !== undefined) return String.fromCodePoint(Number.parseInt(groups.hex, 16));
    return groups?.named === undefined ? entity : (named[groups.named.toLowerCase()] ?? entity);
  });
}

function limitDescriptionText(text: string, maximumLength: number): string {
  if (text.length <= maximumLength) return text;
  let trimmed = text.slice(0, maximumLength - 3).trimEnd();
  const lastSpace = trimmed.lastIndexOf(" ");
  if (lastSpace >= Math.floor(maximumLength * 0.65)) {
    trimmed = trimmed.slice(0, lastSpace);
  }
  return `${trimmed.replace(/[ ,;:]+$/u, "")}...`;
}

function yamlScalar(value: string | number | boolean | null): string {
  if (value === null) return "null";
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "number") return String(value);
  return `'${value.replaceAll("'", "''")}'`;
}

function questionPageNameForSlug(slug: string): string {
  return slug.endsWith("questions") ? `${slug}.md` : `${slug}-questions.md`;
}

function seriesForEpisode(slug: string, isNumbered: boolean): string {
  if (isNumbered) return "numbered livestream";
  if (slug.startsWith("dr-falk-plays-assassin-s-creed-origins-")) {
    return "Assassin's Creed side content";
  }
  return "special stream";
}

function videoIdFromUrl(url: string): string {
  const short = /youtu\.be\/([^?&/]+)/u.exec(url)?.[1];
  if (short !== undefined) return short;
  const query = /[?&]v=([^?&]+)/u.exec(url)?.[1];
  if (query !== undefined) return query;
  throw new Error(`Could not parse YouTube video id from URL '${url}'.`);
}

function timeLabelToSeconds(label: string): number {
  const parts = label.split(":");
  if (parts.length < 2 || parts.length > 3) {
    throw new Error(`Timestamp label '${label}' is not M:SS or H:MM:SS.`);
  }
  if (parts.some((part) => !/^\d+$/u.test(part))) {
    throw new Error(`Timestamp label '${label}' contains a non-numeric part.`);
  }
  const numbers = parts.map(Number);
  if (numbers.length === 2) return (numbers[0] ?? 0) * 60 + (numbers[1] ?? 0);
  return (numbers[0] ?? 0) * 3600 + (numbers[1] ?? 0) * 60 + (numbers[2] ?? 0);
}

async function removeGeneratedQuestionPages(directory: string): Promise<void> {
  const entries = await readdir(directory, { withFileTypes: true }).catch((error: unknown) => {
    if (isMissing(error)) return [];
    throw error;
  });
  for (const entry of entries) {
    if (entry.isFile() && entry.name.endsWith(".md") && entry.name !== "_index.md") {
      await rm(join(directory, entry.name), { force: true });
    }
  }
}

async function countGeneratedQuestionPages(directory: string): Promise<number> {
  return (await readdir(directory, { withFileTypes: true }))
    .filter((entry) => entry.isFile() && entry.name.endsWith(".md") && entry.name !== "_index.md")
    .length;
}

async function runSearchIndexBuilder(repoRoot: string): Promise<void> {
  const scriptPath = join(repoRoot, "scripts/Build-SearchIndex.mjs");
  await requireFile(scriptPath);
  await new Promise<void>((resolvePromise, reject) => {
    const child = spawn(process.execPath, [scriptPath, repoRoot], {
      cwd: repoRoot,
      stdio: "inherit",
      windowsHide: true,
    });
    child.once("error", reject);
    child.once("close", (code) => {
      if (code === 0) resolvePromise();
      else reject(new Error(`Build-SearchIndex.mjs failed with exit code ${code ?? "unknown"}.`));
    });
  });
}

async function requireFile(path: string): Promise<void> {
  try {
    if ((await stat(path)).isFile()) return;
  } catch (error) {
    if (!isMissing(error)) throw error;
  }
  throw new Error(`Missing ${path}.`);
}

async function requireDirectory(path: string): Promise<void> {
  try {
    if ((await stat(path)).isDirectory()) return;
  } catch (error) {
    if (!isMissing(error)) throw error;
  }
  throw new Error(`Missing ${path}.`);
}

function isMissing(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT";
}

function repoRelativePath(repoRoot: string, path: string): string {
  return relative(repoRoot, path).split(sep).join("/");
}

function normalizeLineEndings(text: string): string {
  return text.replace(/^\uFEFF/u, "").replace(/\r\n?/gu, "\n");
}

function splitFileLines(text: string): string[] {
  const lines = text.split("\n");
  if (lines.at(-1) === "") lines.pop();
  return lines;
}

function ensureLf(text: string): string {
  const normalized = normalizeLineEndings(text);
  return normalized.endsWith("\n") ? normalized : `${normalized}\n`;
}

function compareOrdinal(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}
