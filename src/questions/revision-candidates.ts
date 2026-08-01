import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { basename, dirname, extname, relative, resolve, sep } from "node:path";

import {
  isMarkdownDividerCell,
  isOrdinaryQuestionHeader,
  splitMarkdownTableRowStrict,
} from "./table-analysis.js";

export interface RevisionCandidateOptions {
  repoRoot?: string;
  questionsDir?: string;
  transcriptsDir?: string;
  outputDir?: string;
  csvName?: string;
  markdownName?: string;
  largeTranscriptWordThreshold?: number;
  lowQuestionCountThreshold?: number;
  lowQuestionsPerThousandWordsThreshold?: number;
  lowMdWordsPerThousandTxtWordsThreshold?: number;
  scoreSpecialEpisodeDensity?: boolean;
}

export interface ResolvedRevisionCandidateOptions {
  repoRoot: string;
  questionsDir: string;
  transcriptsDir: string;
  outputDir: string;
  csvName: string;
  markdownName: string;
  largeTranscriptWordThreshold: number;
  lowQuestionCountThreshold: number;
  lowQuestionsPerThousandWordsThreshold: number;
  lowMdWordsPerThousandTxtWordsThreshold: number;
  scoreSpecialEpisodeDensity: boolean;
}

export interface TextStats {
  Exists: boolean;
  LineCount: number;
  WordCount: number;
  SizeBytes: number;
  SizeKB: number;
  LastWriteTime: Date | null;
  Text: string;
}

export interface MarkdownQualityStats {
  OrdinaryTableDetected: boolean;
  TableHeaderColumnCount: number;
  QuestionCount: number;
  TimestampLinkCount: number;
  MissingTimestampLinkCount: number;
  MalformedTableRowCount: number;
  LegacyThreeColumnTable: boolean;
  PendingExpandedAnswerCount: number;
  EmptyExpandedAnswerCount: number;
  MissingExpandedAnswerCount: number;
  CompletedExpandedAnswerCount: number;
  RedFlagCount: number;
  DuplicateQuestionCount: number;
  DuplicateQuestionSamples: string;
}

export type TriageCategory = "DAndDSpecial" | "Special" | "Ordinary";
export type RevisionPriority = "Critical" | "High" | "Medium" | "Low" | "OK";

export interface RevisionCandidate {
  EpisodeNumber: number | null;
  Slug: string;
  TriageCategory: TriageCategory;
  DensityScoringSkipped: boolean;
  Priority: RevisionPriority;
  RevisionScore: number;
  Reasons: string;
  MdExists: boolean;
  TxtExists: boolean;
  MdFile: string;
  TxtFile: string;
  MdDuplicateFiles: string;
  TxtDuplicateFiles: string;
  MdLineCount: number;
  TxtLineCount: number;
  MdWordCount: number;
  TxtWordCount: number;
  TxtSizeKB: number;
  OrdinaryTableDetected: boolean;
  TableHeaderColumnCount: number;
  MalformedTableRowCount: number;
  LegacyThreeColumnTable: boolean;
  QuestionCount: number;
  TimestampLinkCount: number;
  MissingTimestampLinkCount: number;
  MissingExpandedAnswerCount: number;
  PendingExpandedAnswerCount: number;
  EmptyExpandedAnswerCount: number;
  CompletedExpandedAnswerCount: number;
  RedFlagCount: number;
  DuplicateQuestionCount: number;
  DuplicateQuestionSamples: string;
  QuestionsPer1000TxtWords: number;
  MdWordsPer1000TxtWords: number;
  MdLinesPer1000TxtLines: number;
  MdLastWriteTime: Date | null;
  TxtLastWriteTime: Date | null;
}

export interface RevisionCandidateReport {
  options: ResolvedRevisionCandidateOptions;
  candidates: RevisionCandidate[];
  csvPath: string;
  markdownPath: string;
}

interface IndexedFile {
  name: string;
  fullPath: string;
  size: number;
  mtime: Date;
}

const defaultOptions = {
  questionsDir: "docs/questions",
  transcriptsDir: "src/transcripts/txt",
  outputDir: "reports",
  csvName: "question-revision-candidates.csv",
  markdownName: "question-revision-candidates.md",
  largeTranscriptWordThreshold: 10_000,
  lowQuestionCountThreshold: 20,
  lowQuestionsPerThousandWordsThreshold: 2.0,
  lowMdWordsPerThousandTxtWordsThreshold: 35.0,
  scoreSpecialEpisodeDensity: false,
} as const;

const candidateColumns: readonly (keyof RevisionCandidate)[] = [
  "EpisodeNumber",
  "Slug",
  "TriageCategory",
  "DensityScoringSkipped",
  "Priority",
  "RevisionScore",
  "Reasons",
  "MdExists",
  "TxtExists",
  "MdFile",
  "TxtFile",
  "MdDuplicateFiles",
  "TxtDuplicateFiles",
  "MdLineCount",
  "TxtLineCount",
  "MdWordCount",
  "TxtWordCount",
  "TxtSizeKB",
  "OrdinaryTableDetected",
  "TableHeaderColumnCount",
  "MalformedTableRowCount",
  "LegacyThreeColumnTable",
  "QuestionCount",
  "TimestampLinkCount",
  "MissingTimestampLinkCount",
  "MissingExpandedAnswerCount",
  "PendingExpandedAnswerCount",
  "EmptyExpandedAnswerCount",
  "CompletedExpandedAnswerCount",
  "RedFlagCount",
  "DuplicateQuestionCount",
  "DuplicateQuestionSamples",
  "QuestionsPer1000TxtWords",
  "MdWordsPer1000TxtWords",
  "MdLinesPer1000TxtLines",
  "MdLastWriteTime",
  "TxtLastWriteTime",
];

export function resolveRevisionRepositoryRoot(
  repoRoot = "",
  startPaths: readonly string[] = [__dirname, process.cwd()],
): string {
  if (repoRoot.trim()) {
    return resolve(repoRoot);
  }
  for (const startPath of new Set(startPaths)) {
    let current = resolve(startPath);
    if (existsSync(current) && statSync(current).isFile()) {
      current = dirname(current);
    }
    while (true) {
      if (
        isDirectory(resolve(current, "docs/questions"))
        && isDirectory(resolve(current, "src/transcripts/txt"))
      ) {
        return current;
      }
      const parent = dirname(current);
      if (parent === current) {
        break;
      }
      current = parent;
    }
  }
  throw new Error(
    "Could not find repository root from the current location or script path. Expected docs/questions and src/transcripts/txt.",
  );
}

export function buildRevisionCandidateReport(
  inputOptions: RevisionCandidateOptions = {},
): RevisionCandidateReport {
  const options = resolveOptions(inputOptions);
  const questionsPath = resolve(options.repoRoot, options.questionsDir);
  const transcriptsPath = resolve(options.repoRoot, options.transcriptsDir);
  const outputPath = resolve(options.repoRoot, options.outputDir);
  if (!isDirectory(questionsPath)) {
    throw new Error(`Questions directory not found: ${questionsPath}`);
  }
  if (!isDirectory(transcriptsPath)) {
    throw new Error(`Transcripts directory not found: ${transcriptsPath}`);
  }

  const markdownFiles = filesWithExtension(questionsPath, ".md");
  const transcriptFiles = filesWithExtension(transcriptsPath, ".txt");
  const txtBySlug = new Map<string, IndexedFile[]>();
  for (const file of transcriptFiles) {
    addFileToSlugIndex(txtBySlug, baseSlug(file), file);
  }
  const mdBySlug = new Map<string, IndexedFile[]>();
  for (const file of markdownFiles) {
    addFileToSlugIndex(mdBySlug, normalizedMarkdownSlug(file, txtBySlug), file);
  }

  const allSlugs = [...new Set([...mdBySlug.keys(), ...txtBySlug.keys()])]
    .sort((left, right) => left.localeCompare(right));
  const candidates = allSlugs.map((slug) => candidateForSlug(slug, mdBySlug, txtBySlug, options));
  candidates.sort((left, right) =>
    right.RevisionScore - left.RevisionScore
    || (left.EpisodeNumber ?? Number.MAX_SAFE_INTEGER) - (right.EpisodeNumber ?? Number.MAX_SAFE_INTEGER)
    || left.Slug.localeCompare(right.Slug)
  );

  return {
    options,
    candidates,
    csvPath: resolve(outputPath, options.csvName),
    markdownPath: resolve(outputPath, options.markdownName),
  };
}

export function writeRevisionCandidateReports(report: RevisionCandidateReport, now = new Date()): void {
  mkdirSync(dirname(report.csvPath), { recursive: true });
  writeFileSync(report.csvPath, revisionCandidatesCsv(report.candidates), "utf8");
  writeFileSync(
    report.markdownPath,
    `${revisionCandidatesMarkdown(report.candidates, report.options, now).join("\n")}\n`,
    "utf8",
  );
}

export function getTextStats(path: string | null): TextStats {
  if (path === null || !existsSync(path) || !statSync(path).isFile()) {
    return emptyTextStats();
  }
  const item = statSync(path);
  const text = readFileSync(path, "utf8");
  const newlineCount = [...text.matchAll(/\r\n|\n|\r/gu)].length;
  const lineCount = text.length === 0 ? 0 : newlineCount + (/(?:\r\n|\n|\r)$/u.test(text) ? 0 : 1);
  const wordCount = [...text.matchAll(/[\p{L}\p{N}][\p{L}\p{N}'’-]*/gu)].length;
  return {
    Exists: true,
    LineCount: lineCount,
    WordCount: wordCount,
    SizeBytes: item.size,
    SizeKB: round(item.size / 1024, 2),
    LastWriteTime: item.mtime,
    Text: text,
  };
}

export function analyzeMarkdownQuality(text: string): MarkdownQualityStats {
  const stats = emptyMarkdownQualityStats();
  if (!text.trim()) {
    return stats;
  }

  const questionTexts: string[] = [];
  const lines = text.split(/\r\n|\n|\r/u);
  for (let index = 0; index < lines.length; index += 1) {
    const trimmed = (lines[index] ?? "").trim();
    if (!trimmed.startsWith("|") || !trimmed.endsWith("|")) {
      continue;
    }

    let headerCells: string[];
    try {
      headerCells = splitMarkdownTableRowStrict(trimmed);
    } catch {
      continue;
    }
    if (!isOrdinaryQuestionHeader(headerCells)) {
      continue;
    }

    stats.OrdinaryTableDetected = true;
    stats.TableHeaderColumnCount = headerCells.length;
    stats.LegacyThreeColumnTable = headerCells.length === 3;
    const expectedColumnCount = headerCells.length;
    const dividerLineIndex = index + 1;
    if (dividerLineIndex >= lines.length) {
      stats.MalformedTableRowCount += 1;
    } else {
      try {
        const dividerCells = splitMarkdownTableRowStrict(lines[dividerLineIndex] ?? "");
        if (
          dividerCells.length !== expectedColumnCount
          || dividerCells.some((cell) => !isMarkdownDividerCell(cell))
        ) {
          stats.MalformedTableRowCount += 1;
        }
      } catch {
        stats.MalformedTableRowCount += 1;
      }
    }

    for (let rowIndex = index + 2; rowIndex < lines.length; rowIndex += 1) {
      const line = lines[rowIndex] ?? "";
      if (!line.trim()) {
        break;
      }
      const rowText = line.trim();
      if (!rowText.startsWith("|") || !rowText.endsWith("|")) {
        break;
      }
      let cells: string[];
      try {
        cells = splitMarkdownTableRowStrict(rowText);
      } catch {
        stats.MalformedTableRowCount += 1;
        continue;
      }
      if (cells.length !== expectedColumnCount) {
        stats.MalformedTableRowCount += 1;
        continue;
      }

      const timeCell = (cells[0] ?? "").trim();
      const questionCell = (cells[1] ?? "").trim();
      if (!questionCell) {
        stats.MalformedTableRowCount += 1;
        continue;
      }
      questionTexts.push(questionCell);
      if (hasMarkdownTimestampLink(timeCell)) {
        stats.TimestampLinkCount += 1;
      }

      if (expectedColumnCount === 3) {
        stats.MissingExpandedAnswerCount += 1;
      } else if (expectedColumnCount === 4) {
        const expandedAnswerCell = (cells[3] ?? "").trim();
        if (!expandedAnswerCell) {
          stats.EmptyExpandedAnswerCount += 1;
        } else if (/_Expansion pending\._/iu.test(expandedAnswerCell)) {
          stats.PendingExpandedAnswerCount += 1;
        } else {
          stats.CompletedExpandedAnswerCount += 1;
        }
      }
    }
    break;
  }

  if (!stats.OrdinaryTableDetected) {
    const fallbackPattern = /^\s{0,3}(?:#{2,6}\s+|[-*]\s+|\d+[.)]\s+).+\?\s*$/gimu;
    for (const match of text.matchAll(fallbackPattern)) {
      const questionText = match[0]
        .replace(/^\s{0,3}#{2,6}\s+/u, "")
        .replace(/^\s{0,3}[-*]\s+/u, "")
        .replace(/^\s{0,3}\d+[.)]\s+/u, "")
        .trim();
      questionTexts.push(questionText);
    }
    stats.TimestampLinkCount = markdownTimestampLinkCount(text);
  }

  stats.QuestionCount = questionTexts.length;
  stats.MissingTimestampLinkCount = Math.max(0, stats.QuestionCount - stats.TimestampLinkCount);
  stats.RedFlagCount = editorialRepairMarkerCount(text);

  const grouped = new Map<string, number>();
  for (const question of questionTexts) {
    const normalized = normalizeQuestionText(question);
    if (normalized) {
      grouped.set(normalized, (grouped.get(normalized) ?? 0) + 1);
    }
  }
  const duplicates = [...grouped.entries()]
    .filter(([, count]) => count > 1)
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]));
  stats.DuplicateQuestionCount = duplicates.reduce((total, [, count]) => total + count - 1, 0);
  stats.DuplicateQuestionSamples = duplicates.slice(0, 3)
    .map(([question, count]) => `${count}x ${question}`)
    .join("; ");
  return stats;
}

export function revisionCandidatesCsv(candidates: readonly RevisionCandidate[]): string {
  const lines = [candidateColumns.map(csvCell).join(",")];
  for (const candidate of candidates) {
    lines.push(candidateColumns.map((column) => csvCell(csvValue(candidate[column]))).join(","));
  }
  return `${lines.join("\n")}\n`;
}

export function revisionCandidatesMarkdown(
  candidates: readonly RevisionCandidate[],
  options: ResolvedRevisionCandidateOptions,
  now = new Date(),
): string[] {
  const counts = new Map<RevisionPriority, number>(
    (["Critical", "High", "Medium", "Low", "OK"] as const).map((priority) => [priority, 0]),
  );
  for (const candidate of candidates) {
    counts.set(candidate.Priority, (counts.get(candidate.Priority) ?? 0) + 1);
  }
  const densitySkipped = candidates.filter((candidate) => candidate.DensityScoringSkipped);
  const lines = [
    "# Question Revision Candidate Report",
    "",
    `Generated: ${formatLocalDateTime(now)}`,
    "",
    "## Summary",
    "",
    "| Priority | Count |",
    "|---|---:|",
    `| Critical | ${counts.get("Critical") ?? 0} |`,
    `| High | ${counts.get("High") ?? 0} |`,
    `| Medium | ${counts.get("Medium") ?? 0} |`,
    `| Low | ${counts.get("Low") ?? 0} |`,
    `| OK | ${counts.get("OK") ?? 0} |`,
    "",
    `CSV report: \`${options.csvName}\``,
  ];
  if (densitySkipped.length > 0) {
    lines.push(
      "",
      `Density scoring skipped for ${densitySkipped.length} special/D&D rows. Use \`--score-special-episode-density\` to include low-density scoring for those rows.`,
    );
  }
  lines.push(
    "",
    "## Top Revision Candidates",
    "",
    "| Score | Priority | Episode | Category | Slug | Questions | Timestamp links | Expanded issues | TXT Words | Q / 1k TXT Words | MD Words / 1k TXT Words | Reasons |",
    "|---:|---|---:|---|---|---:|---:|---:|---:|---:|---:|---|",
  );
  for (const row of candidates.slice(0, 50)) {
    const expandedIssues = row.MissingExpandedAnswerCount
      + row.PendingExpandedAnswerCount
      + row.EmptyExpandedAnswerCount;
    lines.push(
      `| ${row.RevisionScore} | ${row.Priority} | ${row.EpisodeNumber ?? ""} | ${markdownCell(row.TriageCategory)} | ${markdownCell(row.Slug)} | ${row.QuestionCount} | ${row.TimestampLinkCount} | ${expandedIssues} | ${row.TxtWordCount} | ${row.QuestionsPer1000TxtWords} | ${row.MdWordsPer1000TxtWords} | ${markdownCell(row.Reasons)} |`,
    );
  }

  lines.push("", "## Missing Pairs", "");
  const missingRows = candidates.filter((row) => !row.MdExists || !row.TxtExists);
  if (missingRows.length === 0) {
    lines.push("No missing MD/TXT pairs detected.");
  } else {
    lines.push(
      "| Priority | Episode | Slug | MD Exists | TXT Exists | Reasons |",
      "|---|---:|---|---:|---:|---|",
    );
    for (const row of missingRows) {
      lines.push(
        `| ${row.Priority} | ${row.EpisodeNumber ?? ""} | ${markdownCell(row.Slug)} | ${row.MdExists} | ${row.TxtExists} | ${markdownCell(row.Reasons)} |`,
      );
    }
  }
  lines.push(
    "",
    "## Notes",
    "",
    "- The score is only a triage estimate.",
    "- Low question density does not prove the file is bad, but it can be a candidate for review on ordinary streams.",
    "- Special live streams and ETS D&D streams skip low-density scoring by default because their transcript structure is different.",
    "- Editorial repair markers exclude normal transcript-grounded uncertainty wording such as unknown, unclear, and not sure.",
    "- CSV output is the better file for sorting and filtering.",
  );
  return lines;
}

function resolveOptions(input: RevisionCandidateOptions): ResolvedRevisionCandidateOptions {
  const repoRoot = resolveRevisionRepositoryRoot(input.repoRoot ?? "");
  return {
    repoRoot,
    questionsDir: input.questionsDir ?? defaultOptions.questionsDir,
    transcriptsDir: input.transcriptsDir ?? defaultOptions.transcriptsDir,
    outputDir: input.outputDir ?? defaultOptions.outputDir,
    csvName: input.csvName ?? defaultOptions.csvName,
    markdownName: input.markdownName ?? defaultOptions.markdownName,
    largeTranscriptWordThreshold: input.largeTranscriptWordThreshold
      ?? defaultOptions.largeTranscriptWordThreshold,
    lowQuestionCountThreshold: input.lowQuestionCountThreshold ?? defaultOptions.lowQuestionCountThreshold,
    lowQuestionsPerThousandWordsThreshold: input.lowQuestionsPerThousandWordsThreshold
      ?? defaultOptions.lowQuestionsPerThousandWordsThreshold,
    lowMdWordsPerThousandTxtWordsThreshold: input.lowMdWordsPerThousandTxtWordsThreshold
      ?? defaultOptions.lowMdWordsPerThousandTxtWordsThreshold,
    scoreSpecialEpisodeDensity: input.scoreSpecialEpisodeDensity
      ?? defaultOptions.scoreSpecialEpisodeDensity,
  };
}

function candidateForSlug(
  slug: string,
  mdBySlug: ReadonlyMap<string, IndexedFile[]>,
  txtBySlug: ReadonlyMap<string, IndexedFile[]>,
  options: ResolvedRevisionCandidateOptions,
): RevisionCandidate {
  const mdFiles = [...(mdBySlug.get(slug) ?? [])].sort(compareFiles);
  const txtFiles = [...(txtBySlug.get(slug) ?? [])].sort(compareFiles);
  const mdFile = mdFiles[0] ?? null;
  const txtFile = txtFiles[0] ?? null;
  const triageCategory = triageCategoryForSlug(slug);
  const densityScoringSkipped = !options.scoreSpecialEpisodeDensity && triageCategory !== "Ordinary";
  const mdStats = getTextStats(mdFile?.fullPath ?? null);
  const txtStats = getTextStats(txtFile?.fullPath ?? null);
  const quality = analyzeMarkdownQuality(mdStats.Text);
  let score = 0;
  const reasons: string[] = [];
  const add = (points: number, reason: string): void => {
    score += points;
    reasons.push(reason);
  };

  if (!mdStats.Exists) add(100, "Missing MD");
  if (!txtStats.Exists) add(80, "Missing TXT");
  if (mdFiles.length > 1) add(80, "Duplicate MD slug");
  if (txtFiles.length > 1) add(80, "Duplicate TXT slug");

  const questionsPer1000Words = ratioPerThousand(quality.QuestionCount, txtStats.WordCount);
  const mdWordsPer1000TxtWords = ratioPerThousand(mdStats.WordCount, txtStats.WordCount);
  const mdLinesPer1000TxtLines = ratioPerThousand(mdStats.LineCount, txtStats.LineCount);
  if (txtStats.Exists && mdStats.Exists) {
    if (quality.MalformedTableRowCount > 0) add(70, "Malformed question table rows");
    if (quality.LegacyThreeColumnTable) add(55, "Legacy three-column question table");
    if (quality.PendingExpandedAnswerCount > 0) add(55, "Pending expanded-answer placeholders");
    if (quality.EmptyExpandedAnswerCount > 0) add(55, "Empty expanded-answer cells");
    if (!densityScoringSkipped) {
      if (
        txtStats.WordCount >= options.largeTranscriptWordThreshold
        && quality.QuestionCount < options.lowQuestionCountThreshold
      ) {
        add(40, "Large transcript with low question count");
      }
      if (
        questionsPer1000Words > 0
        && questionsPer1000Words < options.lowQuestionsPerThousandWordsThreshold
      ) {
        add(30, "Low questions per 1,000 transcript words");
      }
      if (
        mdWordsPer1000TxtWords > 0
        && mdWordsPer1000TxtWords < options.lowMdWordsPerThousandTxtWordsThreshold
      ) {
        add(25, "Low MD words per 1,000 transcript words");
      }
    }
    if (quality.QuestionCount > 0 && quality.MissingTimestampLinkCount > 0) {
      add(
        quality.TimestampLinkCount === 0 ? 20 : 15,
        quality.TimestampLinkCount === 0
          ? "No timestamp links detected"
          : "Some question rows lack timestamp links",
      );
    }
    if (quality.RedFlagCount > 0) add(15, "Editorial repair marker detected");
    if (quality.DuplicateQuestionCount > 0) add(10, "Duplicate question text detected");
    if (
      mdStats.LastWriteTime !== null
      && txtStats.LastWriteTime !== null
      && mdStats.LastWriteTime < txtStats.LastWriteTime
    ) {
      add(10, "MD older than TXT");
    }
  }

  return {
    EpisodeNumber: episodeNumberForSlug(slug),
    Slug: slug,
    TriageCategory: triageCategory,
    DensityScoringSkipped: densityScoringSkipped,
    Priority: priorityForScore(score),
    RevisionScore: score,
    Reasons: reasons.join("; "),
    MdExists: mdStats.Exists,
    TxtExists: txtStats.Exists,
    MdFile: repoRelativeFile(options.repoRoot, mdFile),
    TxtFile: repoRelativeFile(options.repoRoot, txtFile),
    MdDuplicateFiles: mdFiles.map((file) => repoRelativeFile(options.repoRoot, file)).join("; "),
    TxtDuplicateFiles: txtFiles.map((file) => repoRelativeFile(options.repoRoot, file)).join("; "),
    MdLineCount: mdStats.LineCount,
    TxtLineCount: txtStats.LineCount,
    MdWordCount: mdStats.WordCount,
    TxtWordCount: txtStats.WordCount,
    TxtSizeKB: txtStats.SizeKB,
    OrdinaryTableDetected: quality.OrdinaryTableDetected,
    TableHeaderColumnCount: quality.TableHeaderColumnCount,
    MalformedTableRowCount: quality.MalformedTableRowCount,
    LegacyThreeColumnTable: quality.LegacyThreeColumnTable,
    QuestionCount: quality.QuestionCount,
    TimestampLinkCount: quality.TimestampLinkCount,
    MissingTimestampLinkCount: quality.MissingTimestampLinkCount,
    MissingExpandedAnswerCount: quality.MissingExpandedAnswerCount,
    PendingExpandedAnswerCount: quality.PendingExpandedAnswerCount,
    EmptyExpandedAnswerCount: quality.EmptyExpandedAnswerCount,
    CompletedExpandedAnswerCount: quality.CompletedExpandedAnswerCount,
    RedFlagCount: quality.RedFlagCount,
    DuplicateQuestionCount: quality.DuplicateQuestionCount,
    DuplicateQuestionSamples: quality.DuplicateQuestionSamples,
    QuestionsPer1000TxtWords: questionsPer1000Words,
    MdWordsPer1000TxtWords: mdWordsPer1000TxtWords,
    MdLinesPer1000TxtLines: mdLinesPer1000TxtLines,
    MdLastWriteTime: mdStats.LastWriteTime,
    TxtLastWriteTime: txtStats.LastWriteTime,
  };
}

function filesWithExtension(root: string, extension: string): IndexedFile[] {
  return readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isFile() && extname(entry.name).toLowerCase() === extension)
    .map((entry) => {
      const fullPath = resolve(root, entry.name);
      const stats = statSync(fullPath);
      return { name: entry.name, fullPath, size: stats.size, mtime: stats.mtime };
    });
}

function baseSlug(file: IndexedFile): string {
  return basename(file.name, extname(file.name));
}

function normalizedMarkdownSlug(file: IndexedFile, knownTranscriptSlugs: ReadonlyMap<string, unknown>): string {
  const base = baseSlug(file);
  if (knownTranscriptSlugs.has(base)) {
    return base;
  }
  return base.endsWith("-questions") ? base.slice(0, -"-questions".length) : base;
}

function addFileToSlugIndex(index: Map<string, IndexedFile[]>, slug: string, file: IndexedFile): void {
  const files = index.get(slug) ?? [];
  files.push(file);
  index.set(slug, files);
}

function episodeNumberForSlug(slug: string): number | null {
  const match = /^(\d+)/u.exec(slug);
  return match?.[1] === undefined ? null : Number(match[1]);
}

function triageCategoryForSlug(slug: string): TriageCategory {
  if (/d-and-d-special-live-stream$/iu.test(slug)) {
    return "DAndDSpecial";
  }
  if (/(^special-live-stream-|-open-room-special$)/iu.test(slug)) {
    return "Special";
  }
  return "Ordinary";
}

function hasMarkdownTimestampLink(text: string): boolean {
  return markdownTimestampPattern().test(text);
}

function markdownTimestampLinkCount(text: string): number {
  return [...text.matchAll(markdownTimestampPattern())].length;
}

function markdownTimestampPattern(): RegExp {
  return /(?:<a\s+[^>]*href=["'][^"']*(?:youtu\.be\/|youtube\.com\/watch\?)[^"']*(?:[?&]t=\d+s?)[^"']*["'][^>]*>\s*\d{1,2}:\d{2}(?::\d{2})?\s*<\/a>|\[\d{1,2}:\d{2}(?::\d{2})?\]\([^)]*(?:youtu\.be\/|youtube\.com\/watch\?)[^)]*(?:[?&]t=\d+s?)[^)]*\))/giu;
}

function editorialRepairMarkerCount(text: string): number {
  const patterns = [
    /\bTODO\b/gimu,
    /\bFIXME\b/gimu,
    /\bTBD\b/gimu,
    /(?<!\w)TK(?!\w)/gmu,
    /\bneeds review\b/giu,
    /\bverification needed\b/giu,
    /\btimestamp needed\b/giu,
    /\bmissing timestamp\b/giu,
    /\bcitation needed\b/giu,
    /\btranscript needed\b/giu,
    /\bcheck transcript\b/giu,
    /_Expansion pending\._/giu,
    /\bPLACEHOLDER\b/gmu,
  ];
  return patterns.reduce((count, pattern) => count + [...text.matchAll(pattern)].length, 0);
}

function normalizeQuestionText(text: string): string {
  return text
    .replace(/<[^>]+>/gu, "")
    .replace(/\[[^\]]+\]\([^)]+\)/gu, "")
    .replace(/^\s{0,3}#{2,6}\s+/u, "")
    .replace(/^\s{0,3}[-*]\s+/u, "")
    .replace(/^\d+[.)]\s*/u, "")
    .replace(/\\\|/gu, "|")
    .replace(/\s+/gu, " ")
    .trim()
    .toLowerCase();
}

function emptyTextStats(): TextStats {
  return {
    Exists: false,
    LineCount: 0,
    WordCount: 0,
    SizeBytes: 0,
    SizeKB: 0,
    LastWriteTime: null,
    Text: "",
  };
}

function emptyMarkdownQualityStats(): MarkdownQualityStats {
  return {
    OrdinaryTableDetected: false,
    TableHeaderColumnCount: 0,
    QuestionCount: 0,
    TimestampLinkCount: 0,
    MissingTimestampLinkCount: 0,
    MalformedTableRowCount: 0,
    LegacyThreeColumnTable: false,
    PendingExpandedAnswerCount: 0,
    EmptyExpandedAnswerCount: 0,
    MissingExpandedAnswerCount: 0,
    CompletedExpandedAnswerCount: 0,
    RedFlagCount: 0,
    DuplicateQuestionCount: 0,
    DuplicateQuestionSamples: "",
  };
}

function ratioPerThousand(numerator: number, denominator: number): number {
  return denominator > 0 ? round(numerator / denominator * 1000, 3) : 0;
}

function priorityForScore(score: number): RevisionPriority {
  if (score >= 100) return "Critical";
  if (score >= 70) return "High";
  if (score >= 35) return "Medium";
  if (score > 0) return "Low";
  return "OK";
}

function repoRelativeFile(repoRoot: string, file: IndexedFile | null): string {
  return file === null ? "" : relative(repoRoot, file.fullPath).split(sep).join("/");
}

function compareFiles(left: IndexedFile, right: IndexedFile): number {
  return left.fullPath.localeCompare(right.fullPath);
}

function round(value: number, digits: number): number {
  const factor = 10 ** digits;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

function csvValue(value: RevisionCandidate[keyof RevisionCandidate]): string {
  if (value === null) return "";
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "boolean") return value ? "True" : "False";
  return String(value);
}

function csvCell(value: string | keyof RevisionCandidate): string {
  return `"${String(value).replace(/"/gu, '""')}"`;
}

function markdownCell(value: unknown): string {
  if (value === null || value === undefined) return "";
  return String(value).replace(/\r\n|\n|\r/gu, " ").replace(/\|/gu, "\\|");
}

function formatLocalDateTime(date: Date): string {
  const two = (value: number): string => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${two(date.getMonth() + 1)}-${two(date.getDate())} ${two(date.getHours())}:${two(date.getMinutes())}:${two(date.getSeconds())}`;
}

function isDirectory(path: string): boolean {
  return existsSync(path) && statSync(path).isDirectory();
}
