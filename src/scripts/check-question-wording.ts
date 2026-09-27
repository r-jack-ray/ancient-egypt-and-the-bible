#!/usr/bin/env node
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

import { type MechanicalWordingFinding, scanQuestionTableMechanicalWording, } from "../questions/mechanical-wording.js";
import {
  listQuestionMarkdownFiles,
  parseQuestionTableText,
  questionRepoRelativePath,
  resolveQuestionMarkdownFile,
  resolveQuestionRepositoryRoot,
} from "../questions/table-analysis.js";

interface Options {
  repoRoot: string;
  questionsDir: string;
  paths: string[];
  outputDir: string;
  jsonName: string;
  markdownName: string;
  report: boolean;
  review: boolean;
  strict: boolean;
  strictReview: boolean;
  fuzzy: boolean;
  fuzzyThreshold: number;
  summaryOnly: boolean;
}

interface MechanicalWordingReport {
  generatedAt: string;
  completionCriterion: string;
  reviewPolicy: string;
  review: boolean;
  strict: boolean;
  strictReview: boolean;
  fuzzy: boolean;
  fuzzyThreshold: number;
  filesScanned: number;
  ordinaryFilesScanned: number;
  rowsScanned: number;
  findingCount: number;
  highConfidenceCount: number;
  reviewCount: number;
  parseErrorCount: number;
  parseErrors: string[];
  findings: MechanicalWordingFinding[];
}

const completionCriterion =
    "Completion is based on parse errors and actionable high-confidence issues; review candidates are triage input.";
const reviewPolicy =
    "Review candidates require transcript-grounded judgment. Do not bulk-rewrite them or use a zero review " +
    "count as a completion target. Preserve attribution when it carries interpretation, uncertainty, " +
    "disagreement, opinion, preference, or personal experience.";

export function main(args: readonly string[] = process.argv.slice(2)): number {
  const options = parseArgs(args);
  if (options === null) {
    return 0;
  }

  const repoRoot = resolveQuestionRepositoryRoot(options.repoRoot);
  const questionsPath = resolve(repoRoot, options.questionsDir);
  const outputPath = resolve(repoRoot, options.outputDir);
  const files = options.paths.length > 0
      ? uniqueSorted(options.paths.map((path) => resolveQuestionMarkdownFile(path, repoRoot)))
      : listQuestionMarkdownFiles(questionsPath);
  const includeReview = options.review || options.strictReview || options.fuzzy;

  const findings: MechanicalWordingFinding[] = [];
  const parseErrors: string[] = [];
  let ordinaryFilesScanned = 0;
  let rowsScanned = 0;
  for (const path of files) {
    const relativePath = questionRepoRelativePath(repoRoot, path);
    const parsed = parseQuestionTableText(readFileSync(path, "utf8"), relativePath, false);
    parseErrors.push(...parsed.hardErrors);
    if (parsed.headerColumns > 0) {
      ordinaryFilesScanned += 1;
      rowsScanned += parsed.rows.length;
      findings.push(...scanQuestionTableMechanicalWording(parsed, {
        includeReview,
        includeFuzzy: options.fuzzy,
        fuzzyThreshold: options.fuzzyThreshold,
      }));
    }
  }

  const highConfidenceCount = findings.filter((finding) => finding.confidence === "high").length;
  const reviewCount = findings.length - highConfidenceCount;
  const report: MechanicalWordingReport = {
    generatedAt: new Date().toISOString(),
    completionCriterion,
    reviewPolicy,
    review: includeReview,
    strict: options.strict,
    strictReview: options.strictReview,
    fuzzy: options.fuzzy,
    fuzzyThreshold: options.fuzzyThreshold,
    filesScanned: files.length,
    ordinaryFilesScanned,
    rowsScanned,
    findingCount: findings.length,
    highConfidenceCount,
    reviewCount,
    parseErrorCount: parseErrors.length,
    parseErrors,
    findings,
  };

  console.log(
      `Mechanical wording scan: mode=${includeReview ? "review" : "actionable"} ` +
      `files=${report.filesScanned} ordinary=${report.ordinaryFilesScanned} rows=${report.rowsScanned} ` +
      `issues=${report.highConfidenceCount} review-candidates=${report.reviewCount} ` +
      `parse-errors=${report.parseErrorCount}.`,
  );
  if (parseErrors.length > 0) {
    console.error("Question-table parse errors:");
    for (const error of parseErrors) {
      console.error(`  ${error}`);
    }
  }
  if (reviewCount > 0) {
    console.log(reviewPolicy);
  }
  if (!options.summaryOnly) {
    printFindings(
        "Actionable mechanical wording issues:",
        findings.filter((finding) => finding.confidence === "high"),
    );
    printFindings(
        "Judgment-required review candidates:",
        findings.filter((finding) => finding.confidence === "review"),
    );
  }

  if (options.report) {
    mkdirSync(outputPath, {recursive: true});
    const jsonPath = resolve(outputPath, options.jsonName);
    const markdownPath = resolve(outputPath, options.markdownName);
    writeFileSync(jsonPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
    writeFileSync(markdownPath, `${reportMarkdown(report).join("\n")}\n`, "utf8");
    console.log("Detailed reports:");
    console.log(`  ${jsonPath}`);
    console.log(`  ${markdownPath}`);
  }

  const strictFailure = options.strict && highConfidenceCount > 0;
  const strictReviewFailure = options.strictReview && findings.length > 0;
  return parseErrors.length > 0 || strictFailure || strictReviewFailure ? 1 : 0;
}

export function parseArgs(args: readonly string[]): Options | null {
  const options: Options = {
    repoRoot: "",
    questionsDir: "docs/questions",
    paths: [],
    outputDir: "reports",
    jsonName: "question-wording-scan.json",
    markdownName: "question-wording-scan.md",
    report: false,
    review: false,
    strict: false,
    strictReview: false,
    fuzzy: false,
    fuzzyThreshold: 0.9,
    summaryOnly: false,
  };

  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === "--repo-root") {
      options.repoRoot = required(args[++index], argument);
    } else if (argument === "--questions-dir") {
      options.questionsDir = required(args[++index], argument);
    } else if (argument === "--path") {
      options.paths.push(required(args[++index], argument));
    } else if (argument === "--output-dir") {
      options.outputDir = required(args[++index], argument);
    } else if (argument === "--json-name") {
      options.jsonName = required(args[++index], argument);
    } else if (argument === "--markdown-name") {
      options.markdownName = required(args[++index], argument);
    } else if (argument === "--report") {
      options.report = true;
    } else if (argument === "--review") {
      options.review = true;
    } else if (argument === "--strict") {
      options.strict = true;
    } else if (argument === "--strict-review") {
      options.strictReview = true;
    } else if (argument === "--fuzzy") {
      options.fuzzy = true;
    } else if (argument === "--fuzzy-threshold") {
      options.fuzzyThreshold = probability(required(args[++index], argument), argument);
    } else if (argument === "--summary-only") {
      options.summaryOnly = true;
    } else if (argument === "--help" || argument === "-h") {
      console.log(`Usage: npm run check:question-wording -- [options]

Scans parsed docs/questions Q&A cells for mechanical or report-shaped wording.
The default scan reports actionable high-confidence issues only. Use --review to include
judgment-required candidates. High-confidence issues fail only with --strict; review
candidates also fail only when --strict-review is supplied. Question-table parse errors
always fail.

Review candidates require transcript-grounded judgment. Do not bulk-rewrite them or use a
zero review count as a completion target. Retain attribution when it carries interpretation,
uncertainty, disagreement, opinion, preference, or personal experience.

Options:
  --repo-root <path>
  --questions-dir <path>
  --path <markdown>             Scan one file; repeat for multiple files
  --report                      Write JSON and Markdown reports under reports/
  --output-dir <path>
  --json-name <name>
  --markdown-name <name>
  --review                      Include judgment-required wording candidates
  --strict                      Exit 1 on high-confidence issues
  --strict-review               Exit 1 on high-confidence issues or review candidates
  --fuzzy                       Enable review mode and add typo-tolerant variants
  --fuzzy-threshold <0..1>      Defaults to 0.9
  --summary-only                Suppress individual console findings
  --help`);
      return null;
    } else {
      throw new Error(`Unknown argument: ${argument ?? "(missing)"}`);
    }
  }
  return options;
}

function reportMarkdown(report: MechanicalWordingReport): string[] {
  const lines = [
    "# Question Wording Scan",
    "",
    `Generated: ${report.generatedAt}`,
    "",
    "| Metric | Count |",
    "|---|---:|",
    `| Files scanned | ${report.filesScanned} |`,
    `| Ordinary files scanned | ${report.ordinaryFilesScanned} |`,
    `| Question rows scanned | ${report.rowsScanned} |`,
    `| High-confidence issues | ${report.highConfidenceCount} |`,
    `| Review candidates | ${report.reviewCount} |`,
    `| Question-table parse errors | ${report.parseErrorCount} |`,
    "",
    report.completionCriterion,
    "",
    report.reviewPolicy,
    "",
  ];
  if (report.parseErrors.length > 0) {
    lines.push("## Question-Table Parse Errors", "", ...report.parseErrors.map((error) => `- ${error}`), "");
  }
  appendReportFindings(
      lines,
      "Actionable Issues",
      report.findings.filter((finding) => finding.confidence === "high"),
  );
  appendReportFindings(
      lines,
      "Judgment-Required Review Candidates",
      report.findings.filter((finding) => finding.confidence === "review"),
  );
  return lines;
}

function appendReportFindings(
    lines: string[],
    heading: string,
    findings: readonly MechanicalWordingFinding[],
): void {
  if (findings.length === 0) {
    return;
  }
  lines.push(`## ${heading}`, "");
  for (const finding of findings) {
    const fuzzyDetail = finding.similarity === undefined
        ? ""
        : `; near \`${escapeInlineCode(finding.referencePhrase ?? "")}\` at ${finding.similarity.toFixed(3)}`;
    lines.push(
        `- \`${finding.file}:${finding.lineNumber}\` [${finding.cell}] ` +
        `\`${finding.ruleId}\`: \`${escapeInlineCode(finding.match)}\`${fuzzyDetail}`,
        `  - ${escapeMarkdown(finding.excerpt)}`,
        `  - Guidance: ${escapeMarkdown(finding.guidance)}`,
    );
  }
  lines.push("");
}

function printFindings(title: string, findings: readonly MechanicalWordingFinding[]): void {
  if (findings.length === 0) {
    return;
  }
  console.log(title);
  for (const finding of findings) {
    const fuzzyDetail = finding.similarity === undefined
        ? ""
        : ` -> ${JSON.stringify(finding.referencePhrase)} (${finding.similarity.toFixed(3)})`;
    console.log(
        `  ${finding.file}:${finding.lineNumber} [${finding.cell}] ` +
        `${finding.ruleId}: ${JSON.stringify(finding.match)}${fuzzyDetail}`,
    );
    console.log(`    Guidance: ${finding.guidance}`);
  }
}

function uniqueSorted(values: readonly string[]): string[] {
  return [...new Set(values)].sort((left, right) => left.localeCompare(right));
}

function probability(value: string, option: string): number {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0 || number > 1) {
    throw new Error(`${option} must be a number between 0 and 1.`);
  }
  return number;
}

function required(value: string | undefined, option: string): string {
  if (value === undefined || !value.trim()) {
    throw new Error(`Missing value for ${option}.`);
  }
  return value;
}

function escapeInlineCode(value: string): string {
  return value.replace(/`/gu, "\\`");
}

function escapeMarkdown(value: string): string {
  return value.replace(/([\\*_[\]|])/gu, "\\$1");
}

if (require.main === module) {
  try {
    process.exitCode = main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
