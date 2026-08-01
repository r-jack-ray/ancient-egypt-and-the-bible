#!/usr/bin/env node
import {
  buildRevisionCandidateReport,
  type RevisionCandidateOptions,
  writeRevisionCandidateReports,
} from "../questions/revision-candidates.js";

export function main(args: readonly string[] = process.argv.slice(2)): number {
  const options = parseArgs(args);
  if (options === null) {
    return 0;
  }
  const report = buildRevisionCandidateReport(options);
  writeRevisionCandidateReports(report);
  console.log("Revision report created:");
  console.log(`  CSV: ${report.csvPath}`);
  console.log(`  MD : ${report.markdownPath}`);
  return 0;
}

export function parseArgs(args: readonly string[]): RevisionCandidateOptions | null {
  const options: RevisionCandidateOptions = {};
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === "--repo-root") options.repoRoot = required(args[++index], argument);
    else if (argument === "--questions-dir") options.questionsDir = required(args[++index], argument);
    else if (argument === "--transcripts-dir") options.transcriptsDir = required(args[++index], argument);
    else if (argument === "--output-dir") options.outputDir = required(args[++index], argument);
    else if (argument === "--csv-name") options.csvName = required(args[++index], argument);
    else if (argument === "--markdown-name") options.markdownName = required(args[++index], argument);
    else if (argument === "--large-transcript-word-threshold") {
      options.largeTranscriptWordThreshold = integer(required(args[++index], argument), argument);
    } else if (argument === "--low-question-count-threshold") {
      options.lowQuestionCountThreshold = integer(required(args[++index], argument), argument);
    } else if (argument === "--low-questions-per-thousand-words-threshold") {
      options.lowQuestionsPerThousandWordsThreshold = number(required(args[++index], argument), argument);
    } else if (argument === "--low-md-words-per-thousand-txt-words-threshold") {
      options.lowMdWordsPerThousandTxtWordsThreshold = number(required(args[++index], argument), argument);
    } else if (argument === "--score-special-episode-density") {
      options.scoreSpecialEpisodeDensity = true;
    } else if (argument === "--help" || argument === "-h") {
      console.log(`Usage: tsx src/scripts/report-question-revisions.ts [options]

Options:
  --repo-root <path>
  --questions-dir <path>
  --transcripts-dir <path>
  --output-dir <path>
  --csv-name <name>
  --markdown-name <name>
  --large-transcript-word-threshold <count>
  --low-question-count-threshold <count>
  --low-questions-per-thousand-words-threshold <number>
  --low-md-words-per-thousand-txt-words-threshold <number>
  --score-special-episode-density
  --help`);
      return null;
    } else {
      throw new Error(`Unknown argument: ${argument ?? "(missing)"}`);
    }
  }
  return options;
}

function required(value: string | undefined, option: string): string {
  if (value === undefined || !value.trim()) {
    throw new Error(`Missing value for ${option}.`);
  }
  return value;
}

function integer(value: string, option: string): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed)) {
    throw new Error(`${option} must be an integer.`);
  }
  return parsed;
}

function number(value: string, option: string): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    throw new Error(`${option} must be a number.`);
  }
  return parsed;
}

if (require.main === module) {
  try {
    process.exitCode = main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
