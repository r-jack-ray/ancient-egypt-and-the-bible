#!/usr/bin/env node
import { existsSync, readdirSync } from "node:fs";
import { resolve } from "node:path";

import {
  analyzeQuestionTableFile,
  type QuestionTableReport,
  resolveQuestionMarkdownFile,
  resolveQuestionRepositoryRoot,
  writeQuestionReportFiles,
} from "../questions/table-analysis.js";

interface Options {
  repoRoot: string;
  questionsDir: string;
  paths: string[];
  outputDir: string;
  jsonName: string;
  markdownName: string;
  allowLegacyThreeColumn: boolean;
  requireExpandedAnswer: boolean;
}

export function main(args: readonly string[] = process.argv.slice(2)): number {
  const options = parseArgs(args);
  if (options === null) {
    return 0;
  }

  const repoRoot = resolveQuestionRepositoryRoot(options.repoRoot);
  const questionsPath = resolve(repoRoot, options.questionsDir);
  const outputPath = resolve(repoRoot, options.outputDir);
  const requireExpandedAnswer = options.requireExpandedAnswer || !options.allowLegacyThreeColumn;

  const files = options.paths.length > 0
    ? uniqueSorted(options.paths.map((path) => resolveQuestionMarkdownFile(path, repoRoot)))
    : questionMarkdownFiles(questionsPath);
  const details = files.map((path) => analyzeQuestionTableFile(path, repoRoot, requireExpandedAnswer));
  const ordinary = details.filter((detail) =>
    detail.headerColumns > 0
    && ["ordinaryThreeColumn", "ordinaryFourColumn", "malformed"].includes(detail.classification)
  );
  const malformed = details.filter((detail) => detail.classification === "malformed");
  const warnings = details.flatMap((detail) => detail.warnings);
  const hardErrors = details.flatMap((detail) => detail.hardErrors);
  const ordinaryFourColumn = details.filter((detail) => detail.classification === "ordinaryFourColumn");

  const report: QuestionTableReport = {
    generatedAt: new Date().toISOString(),
    requireExpandedAnswer,
    allowLegacyThreeColumn: options.allowLegacyThreeColumn,
    filesScanned: files.length,
    ordinaryFilesValidated: ordinary.length,
    ordinaryFourColumn: ordinaryFourColumn.length,
    totalQuestionRows: sum(details.map((detail) => detail.rowCount)),
    pendingExpandedAnswers: sum(details.map((detail) => detail.pendingExpandedAnswers)),
    completedExpandedAnswers: sum(details.map((detail) => detail.completedExpandedAnswers)),
    emptyExpandedAnswers: sum(details.map((detail) => detail.emptyExpandedAnswers)),
    malformed: malformed.length,
    hardErrorCount: hardErrors.length,
    warningCount: warnings.length,
    hardErrors,
    warnings,
    files: details,
  };

  const markdown = questionTableReportMarkdown(report);
  const jsonPath = resolve(outputPath, options.jsonName);
  const markdownPath = resolve(outputPath, options.markdownName);
  writeQuestionReportFiles(report, jsonPath, markdownPath, markdown);

  console.log("Question table validation complete.");
  console.log(`Files scanned: ${report.filesScanned}`);
  console.log(`Ordinary files validated: ${report.ordinaryFilesValidated}`);
  console.log(`Question rows: ${report.totalQuestionRows}`);
  console.log(`Hard errors: ${report.hardErrorCount}`);
  console.log(`Warnings: ${report.warningCount}`);
  console.log("Reports:");
  console.log(`  ${jsonPath}`);
  console.log(`  ${markdownPath}`);
  return hardErrors.length > 0 ? 1 : 0;
}

export function parseArgs(args: readonly string[]): Options | null {
  const options: Options = {
    repoRoot: "",
    questionsDir: "docs/questions",
    paths: [],
    outputDir: "reports",
    jsonName: "question-table-validation.json",
    markdownName: "question-table-validation.md",
    allowLegacyThreeColumn: false,
    requireExpandedAnswer: false,
  };

  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === "--repo-root") options.repoRoot = required(args[++index], argument);
    else if (argument === "--questions-dir") options.questionsDir = required(args[++index], argument);
    else if (argument === "--path") options.paths.push(required(args[++index], argument));
    else if (argument === "--output-dir") options.outputDir = required(args[++index], argument);
    else if (argument === "--json-name") options.jsonName = required(args[++index], argument);
    else if (argument === "--markdown-name") options.markdownName = required(args[++index], argument);
    else if (argument === "--allow-legacy-three-column") options.allowLegacyThreeColumn = true;
    else if (argument === "--require-expanded-answer") options.requireExpandedAnswer = true;
    else if (argument === "--help" || argument === "-h") {
      console.log(`Usage: tsx src/scripts/check-question-tables.ts [options]

Options:
  --repo-root <path>
  --questions-dir <path>
  --path <markdown>             Validate one file; repeat for multiple files
  --output-dir <path>
  --json-name <name>
  --markdown-name <name>
  --allow-legacy-three-column
  --require-expanded-answer
  --help`);
      return null;
    } else {
      throw new Error(`Unknown argument: ${argument ?? "(missing)"}`);
    }
  }
  return options;
}

function questionMarkdownFiles(questionsPath: string): string[] {
  if (!existsSync(questionsPath)) {
    throw new Error(`Questions directory not found: ${questionsPath}`);
  }
  return readdirSync(questionsPath, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith(".md"))
    .map((entry) => resolve(questionsPath, entry.name))
    .sort((left, right) => left.localeCompare(right));
}

function questionTableReportMarkdown(report: QuestionTableReport): string[] {
  const lines = [
    "# Question Table Validation",
    "",
    `Generated: ${report.generatedAt}`,
    "",
    "| Metric | Count |",
    "|---|---:|",
    `| Files scanned | ${report.filesScanned} |`,
    `| Ordinary files validated | ${report.ordinaryFilesValidated} |`,
    `| Ordinary four-column | ${report.ordinaryFourColumn} |`,
    `| Total question rows | ${report.totalQuestionRows} |`,
    `| Pending expanded answers | ${report.pendingExpandedAnswers} |`,
    `| Completed expanded answers | ${report.completedExpandedAnswers} |`,
    `| Empty expanded-answer cells | ${report.emptyExpandedAnswers} |`,
    `| Malformed files | ${report.malformed} |`,
    `| Hard errors | ${report.hardErrorCount} |`,
    `| Warnings | ${report.warningCount} |`,
    "",
  ];

  if (report.hardErrors.length > 0) {
    lines.push("## Hard Errors", "", ...report.hardErrors.map((error) => `- ${error}`), "");
  }
  if (report.warnings.length > 0) {
    lines.push("## Warnings", "", ...report.warnings.map((warning) => `- ${warning}`), "");
  }
  return lines;
}

function uniqueSorted(values: readonly string[]): string[] {
  return [...new Set(values)].sort((left, right) => left.localeCompare(right));
}

function sum(values: readonly number[]): number {
  return values.reduce((total, value) => total + value, 0);
}

function required(value: string | undefined, option: string): string {
  if (value === undefined || !value.trim()) {
    throw new Error(`Missing value for ${option}.`);
  }
  return value;
}

if (require.main === module) {
  try {
    process.exitCode = main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
