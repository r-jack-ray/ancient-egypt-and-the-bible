import { existsSync, readFileSync, statSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, isAbsolute, relative, resolve, sep } from "node:path";

export type QuestionTableClassification =
  | "ordinaryThreeColumn"
  | "ordinaryFourColumn"
  | "malformed"
  | "specialFormat";

export interface QuestionTableAnalysis {
  file: string;
  classification: QuestionTableClassification;
  headerLine: number | null;
  headerColumns: number;
  rowCount: number;
  pendingExpandedAnswers: number;
  completedExpandedAnswers: number;
  emptyExpandedAnswers: number;
  hardErrors: string[];
  warnings: string[];
}

export interface QuestionTableTimestamp {
  href: string;
  label: string;
  startSeconds: number;
}

export interface ParsedQuestionTableRow {
  lineNumber: number;
  timeCell: string;
  question: string;
  shortAnswer: string;
  expandedAnswer: string | null;
  timestamp: QuestionTableTimestamp | null;
}

export interface ParsedQuestionTable extends QuestionTableAnalysis {
  rows: ParsedQuestionTableRow[];
}

export interface QuestionTableReport {
  generatedAt: string;
  requireExpandedAnswer: boolean;
  allowLegacyThreeColumn: boolean;
  filesScanned: number;
  ordinaryFilesValidated: number;
  ordinaryFourColumn: number;
  totalQuestionRows: number;
  pendingExpandedAnswers: number;
  completedExpandedAnswers: number;
  emptyExpandedAnswers: number;
  malformed: number;
  hardErrorCount: number;
  warningCount: number;
  hardErrors: string[];
  warnings: string[];
  files: QuestionTableAnalysis[];
}

export function resolveQuestionRepositoryRoot(
  repoRoot = "",
  startPaths: readonly string[] = [__dirname, process.cwd()],
): string {
  if (repoRoot.trim()) {
    const resolved = resolve(repoRoot);
    if (isQuestionRepositoryRoot(resolved)) {
      return resolved;
    }
    throw new Error(
      `Repository root '${repoRoot}' does not contain package.json, docs/questions, and src/channel/episodes.json.`,
    );
  }

  for (const startPath of new Set(startPaths)) {
    let current = resolve(startPath);
    if (existsSync(current) && statSync(current).isFile()) {
      current = dirname(current);
    }

    while (true) {
      if (isQuestionRepositoryRoot(current)) {
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
    "Could not find repository root. Expected package.json, docs/questions, and src/channel/episodes.json.",
  );
}

export function questionRepoRelativePath(repoRoot: string, path: string): string {
  return relative(repoRoot, path).split(sep).join("/");
}

export function resolveQuestionMarkdownFile(inputPath: string, repoRoot: string): string {
  const candidate = isAbsolute(inputPath) ? inputPath : resolve(repoRoot, inputPath);
  if (!existsSync(candidate)) {
    throw new Error(`Question Markdown file not found: ${inputPath}`);
  }
  const item = statSync(candidate);
  if (item.isDirectory()) {
    throw new Error(`Question Markdown path is a directory: ${inputPath}`);
  }
  if (!candidate.toLowerCase().endsWith(".md")) {
    throw new Error(`Question Markdown path must end in .md: ${inputPath}`);
  }
  return resolve(candidate);
}

export function splitMarkdownTableRowStrict(line: string): string[] {
  const trimmed = line.trim();
  if (!trimmed.startsWith("|") || !trimmed.endsWith("|")) {
    throw new Error("Line is not a complete Markdown table row.");
  }

  const cells: string[] = [];
  let current = "";
  let escaped = false;
  for (const character of trimmed.slice(1, -1)) {
    if (escaped) {
      current += character;
      escaped = false;
      continue;
    }
    if (character === "\\") {
      current += character;
      escaped = true;
      continue;
    }
    if (character === "|") {
      cells.push(current.trim());
      current = "";
      continue;
    }
    current += character;
  }
  cells.push(current.trim());
  return cells;
}

export function isMarkdownDividerCell(cell: string): boolean {
  return /^:?-{3,}:?$/u.test(cell);
}

export function questionTimeLabelToSeconds(label: string): number {
  const parts = label.split(":");
  if (parts.length < 2 || parts.length > 3) {
    throw new Error(`Timestamp label '${label}' is not M:SS or H:MM:SS.`);
  }
  if (parts.some((part) => !/^\d+$/u.test(part))) {
    throw new Error(`Timestamp label '${label}' contains a non-numeric part.`);
  }
  const values = parts.map(Number);
  if (values.length === 2) {
    return requiredNumber(values[0]) * 60 + requiredNumber(values[1]);
  }
  return requiredNumber(values[0]) * 3600 + requiredNumber(values[1]) * 60 + requiredNumber(values[2]);
}

export function isOrdinaryQuestionHeader(cells: readonly string[]): boolean {
  if (cells.length === 3) {
    return cells[0] === "Time"
      && cells[1] === "Question"
      && cells[2] === "Short answer / answer direction";
  }
  if (cells.length === 4) {
    return cells[0] === "Time"
      && cells[1] === "Question"
      && cells[2] === "Short answer / answer direction"
      && cells[3] === "Expanded answer";
  }
  return false;
}

export function analyzeQuestionTableFile(
  path: string,
  repoRoot: string,
  requireExpandedAnswer = false,
): QuestionTableAnalysis {
  const text = readFileSync(path, "utf8");
  return analyzeQuestionTableText(
    text,
    questionRepoRelativePath(repoRoot, path),
    requireExpandedAnswer,
  );
}

export function analyzeQuestionTableText(
  text: string,
  relativePath: string,
  requireExpandedAnswer = false,
): QuestionTableAnalysis {
  const parsed = parseQuestionTableText(text, relativePath, requireExpandedAnswer);
  return {
    file: parsed.file,
    classification: parsed.classification,
    headerLine: parsed.headerLine,
    headerColumns: parsed.headerColumns,
    rowCount: parsed.rowCount,
    pendingExpandedAnswers: parsed.pendingExpandedAnswers,
    completedExpandedAnswers: parsed.completedExpandedAnswers,
    emptyExpandedAnswers: parsed.emptyExpandedAnswers,
    hardErrors: parsed.hardErrors,
    warnings: parsed.warnings,
  };
}

export function parseQuestionTableText(
  text: string,
  relativePath: string,
  requireExpandedAnswer = false,
): ParsedQuestionTable {
  const lines = fileLines(text);
  const hardErrors: string[] = [];
  const warnings: string[] = [];
  let headerLineIndex = -1;
  let headerCells: string[] = [];
  let tableLikeLineCount = 0;

  for (const [index, line] of lines.entries()) {
    if (!line.trimStart().startsWith("|")) {
      continue;
    }
    tableLikeLineCount += 1;
    try {
      const cells = splitMarkdownTableRowStrict(line);
      if (isOrdinaryQuestionHeader(cells)) {
        headerLineIndex = index;
        headerCells = cells;
        break;
      }
    } catch (error) {
      hardErrors.push(`${relativePath}:${index + 1} ${errorMessage(error)}`);
    }
  }

  if (headerLineIndex < 0) {
    if (tableLikeLineCount > 0 && hardErrors.length === 0) {
      hardErrors.push(`${relativePath} is missing an ordinary Q&A table header.`);
    }
    return {
      file: relativePath,
      classification: hardErrors.length > 0 || tableLikeLineCount > 0 ? "malformed" : "specialFormat",
      headerLine: null,
      headerColumns: 0,
      rowCount: 0,
      pendingExpandedAnswers: 0,
      completedExpandedAnswers: 0,
      emptyExpandedAnswers: 0,
      hardErrors,
      warnings,
      rows: [],
    };
  }

  const expectedColumns = headerCells.length;
  let classification: QuestionTableClassification = expectedColumns === 4
    ? "ordinaryFourColumn"
    : "ordinaryThreeColumn";
  if (requireExpandedAnswer && expectedColumns !== 4) {
    hardErrors.push(
      `${relativePath}:${headerLineIndex + 1} has ${expectedColumns} columns; expected 4 with Expanded answer.`,
    );
  }

  const dividerLineIndex = headerLineIndex + 1;
  if (dividerLineIndex >= lines.length) {
    hardErrors.push(`${relativePath}:${dividerLineIndex + 1} is missing the table divider row.`);
  } else {
    try {
      const dividerCells = splitMarkdownTableRowStrict(requiredLine(lines[dividerLineIndex]));
      if (dividerCells.length !== expectedColumns) {
        hardErrors.push(
          `${relativePath}:${dividerLineIndex + 1} has ${dividerCells.length} divider cells; expected ${expectedColumns}.`,
        );
      }
      for (const cell of dividerCells) {
        if (!isMarkdownDividerCell(cell)) {
          hardErrors.push(`${relativePath}:${dividerLineIndex + 1} has invalid divider cell '${cell}'.`);
        }
      }
    } catch (error) {
      hardErrors.push(`${relativePath}:${dividerLineIndex + 1} ${errorMessage(error)}`);
    }
  }

  let rowCount = 0;
  let pendingExpandedAnswers = 0;
  let completedExpandedAnswers = 0;
  let emptyExpandedAnswers = 0;
  const rows: ParsedQuestionTableRow[] = [];

  for (let index = headerLineIndex + 2; index < lines.length; index += 1) {
    const line = requiredLine(lines[index]);
    if (!line.trim()) {
      break;
    }
    if (!line.trimStart().startsWith("|")) {
      hardErrors.push(`${relativePath}:${index + 1} interrupts the Q&A table.`);
      break;
    }

    rowCount += 1;
    let cells: string[];
    try {
      cells = splitMarkdownTableRowStrict(line);
    } catch (error) {
      hardErrors.push(`${relativePath}:${index + 1} ${errorMessage(error)}`);
      continue;
    }
    if (cells.length !== expectedColumns) {
      hardErrors.push(`${relativePath}:${index + 1} has ${cells.length} cells; expected ${expectedColumns}.`);
      continue;
    }

    const timeCell = requiredCell(cells, 0);
    const questionCell = requiredCell(cells, 1);
    const shortAnswerCell = requiredCell(cells, 2);
    const expandedAnswerCell = expectedColumns === 4 ? requiredCell(cells, 3) : null;
    if (!questionCell.trim()) {
      hardErrors.push(`${relativePath}:${index + 1} has an empty question cell.`);
    }
    if (!shortAnswerCell.trim()) {
      hardErrors.push(`${relativePath}:${index + 1} has an empty short-answer cell.`);
    }

    const timestampMatch = /<a\s+href="(?<href>https:\/\/(?:youtu\.be\/[^"?]+|www\.youtube\.com\/watch\?[^"\n]+)[^"\n]*[?&]t=(?<seconds>\d+)[^"\n]*)"\s+target="_blank"\s+rel="noopener noreferrer">(?<label>[^<]+)<\/a>/iu.exec(timeCell);
    let timestamp: QuestionTableTimestamp | null = null;
    if (timestampMatch?.groups === undefined) {
      hardErrors.push(`${relativePath}:${index + 1} has a malformed timestamp anchor.`);
    } else {
      const href = requiredGroup(timestampMatch.groups, "href");
      const label = requiredGroup(timestampMatch.groups, "label");
      const seconds = Number(requiredGroup(timestampMatch.groups, "seconds"));
      try {
        timestamp = { href, label, startSeconds: seconds };
        if (questionTimeLabelToSeconds(label) !== seconds) {
          hardErrors.push(
            `${relativePath}:${index + 1} timestamp label '${label}' does not match ?t=${seconds}.`,
          );
        }
      } catch (error) {
        hardErrors.push(`${relativePath}:${index + 1} ${errorMessage(error)}`);
      }
    }

    if (expandedAnswerCell !== null) {
      if (!expandedAnswerCell.trim()) {
        emptyExpandedAnswers += 1;
        hardErrors.push(`${relativePath}:${index + 1} has an empty expanded-answer cell.`);
      } else if (/_Expansion pending\._/iu.test(expandedAnswerCell)) {
        pendingExpandedAnswers += 1;
        if (requireExpandedAnswer) {
          hardErrors.push(`${relativePath}:${index + 1} has a pending expanded-answer placeholder.`);
        }
      } else {
        completedExpandedAnswers += 1;
        if (expandedAnswerCell === shortAnswerCell) {
          warnings.push(`${relativePath}:${index + 1} expanded answer is identical to the short answer.`);
        } else if (expandedAnswerCell.length < shortAnswerCell.length) {
          warnings.push(`${relativePath}:${index + 1} expanded answer is shorter than the short answer.`);
        }
      }
    }

    rows.push({
      lineNumber: index + 1,
      timeCell,
      question: questionCell,
      shortAnswer: shortAnswerCell,
      expandedAnswer: expandedAnswerCell,
      timestamp,
    });
  }

  if (rowCount === 0) {
    hardErrors.push(`${relativePath}:${headerLineIndex + 1} has no Q&A data rows.`);
  }
  if (hardErrors.length > 0) {
    classification = "malformed";
  }

  return {
    file: relativePath,
    classification,
    headerLine: headerLineIndex + 1,
    headerColumns: expectedColumns,
    rowCount,
    pendingExpandedAnswers,
    completedExpandedAnswers,
    emptyExpandedAnswers,
    hardErrors,
    warnings,
    rows,
  };
}

export function writeQuestionReportFiles(
  report: QuestionTableReport,
  jsonPath: string,
  markdownPath: string,
  markdownLines: readonly string[],
): void {
  mkdirSync(dirname(jsonPath), { recursive: true });
  writeFileSync(jsonPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  writeFileSync(markdownPath, `${markdownLines.join("\n")}\n`, "utf8");
}

function isQuestionRepositoryRoot(path: string): boolean {
  return existsSync(resolve(path, "package.json"))
    && statSync(resolve(path, "package.json")).isFile()
    && existsSync(resolve(path, "docs/questions"))
    && statSync(resolve(path, "docs/questions")).isDirectory()
    && existsSync(resolve(path, "src/channel/episodes.json"))
    && statSync(resolve(path, "src/channel/episodes.json")).isFile();
}

function fileLines(text: string): string[] {
  if (!text) {
    return [];
  }
  const lines = text.split(/\r\n|\n|\r/u);
  if (lines.at(-1) === "") {
    lines.pop();
  }
  return lines;
}

function requiredLine(line: string | undefined): string {
  if (line === undefined) {
    throw new Error("Required line is missing.");
  }
  return line;
}

function requiredCell(cells: readonly string[], index: number): string {
  const cell = cells[index];
  if (cell === undefined) {
    throw new Error(`Required table cell ${index + 1} is missing.`);
  }
  return cell;
}

function requiredNumber(value: number | undefined): number {
  if (value === undefined) {
    throw new Error("Required timestamp part is missing.");
  }
  return value;
}

function requiredGroup(groups: Record<string, string | undefined>, name: string): string {
  const value = groups[name];
  if (value === undefined) {
    throw new Error(`Required regex group '${name}' is missing.`);
  }
  return value;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
