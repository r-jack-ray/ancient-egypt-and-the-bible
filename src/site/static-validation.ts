import { readdir, readFile } from "node:fs/promises";
import { basename, resolve } from "node:path";

export interface StaticSiteValidationOptions {
  repoRoot?: string;
}

export interface StaticSiteValidationSummary {
  sourceQuestionCount: number;
  numberedPageCount: number;
  specialPageCount: number;
  generatedDescriptionCount: number;
  overriddenDescriptionCount: number;
  questionRowCount: number;
}

interface GeneratedDescription {
  path: string;
  description: string;
  normalizedDescription: string;
  source: "generated_from_questions" | "curated_override";
}

const generatedDescriptionPattern =
  /^Explore \d+ transcript-grounded questions? from .+(?:, including ".*" and ".*"|: ".*")$/;

export async function validateStaticSite(
  options: StaticSiteValidationOptions = {},
): Promise<StaticSiteValidationSummary> {
  const repoRoot = resolve(options.repoRoot ?? ".");
  const sourceDir = resolve(repoRoot, "docs/questions");
  const generatedDir = resolve(repoRoot, "site/content/questions");

  const sourceFiles = (await markdownFiles(sourceDir)).sort();
  const generatedFiles = (await markdownFiles(generatedDir))
    .filter((file) => file !== "_index.md")
    .sort();

  if (sourceFiles.length !== generatedFiles.length) {
    throw new Error(
      `Generated question count ${generatedFiles.length} does not match source count ${sourceFiles.length}.`,
    );
  }

  const expectedNumberedPageCount = sourceFiles.filter(isNumberedPage).length;
  const expectedSpecialPageCount = sourceFiles.length - expectedNumberedPageCount;
  const numberedPageCount = generatedFiles.filter(isNumberedPage).length;
  const specialPageCount = generatedFiles.length - numberedPageCount;

  if (numberedPageCount !== expectedNumberedPageCount) {
    throw new Error(
      `Expected ${expectedNumberedPageCount} numbered pages from docs/questions, found ${numberedPageCount}.`,
    );
  }
  if (specialPageCount !== expectedSpecialPageCount) {
    throw new Error(
      `Expected ${expectedSpecialPageCount} special pages from docs/questions, found ${specialPageCount}.`,
    );
  }

  const descriptions = await Promise.all(
    generatedFiles.map(async (file): Promise<GeneratedDescription> => {
      const path = resolve(generatedDir, file);
      const content = await readFile(path, "utf8");
      const descriptionMatch = /^description: '(?<value>(?:[^']|'')*)'\r?$/m.exec(content);
      const sourceMatch =
        /^description_source: '(?<value>generated_from_questions|curated_override)'\r?$/m.exec(
          content,
        );
      const description = descriptionMatch?.groups?.value?.replaceAll("''", "'").trim();
      const source = sourceMatch?.groups?.value;

      if (
        !description ||
        (source !== "generated_from_questions" && source !== "curated_override")
      ) {
        throw new Error(`Generated page is missing a valid description or description_source: ${path}`);
      }
      if (source === "generated_from_questions" && !generatedDescriptionPattern.test(description)) {
        throw new Error(
          `Generated question-derived description is not substantive or uses an unexpected format: ${path}`,
        );
      }

      return {
        path,
        description,
        normalizedDescription: description.toLocaleLowerCase("en-US"),
        source,
      };
    }),
  );

  const pathsByDescription = new Map<string, string[]>();
  for (const record of descriptions) {
    const paths = pathsByDescription.get(record.normalizedDescription) ?? [];
    paths.push(record.path);
    pathsByDescription.set(record.normalizedDescription, paths);
  }
  const duplicatePaths = [...pathsByDescription.values()].filter((paths) => paths.length > 1);
  if (duplicatePaths.length > 0) {
    throw new Error(
      `Found duplicate generated page descriptions: ${duplicatePaths.map((paths) => paths.join(", ")).join("; ")}`,
    );
  }

  const episodes = parseJsonArray(await readFile(resolve(repoRoot, "site/data/episodes.json"), "utf8"));
  if (episodes.length === 0) {
    throw new Error("Generated episode data is empty.");
  }
  const questions = parseJsonArray(
    await readFile(resolve(repoRoot, "site/data/questions.json"), "utf8"),
  );

  const requiredFields = ["question_page", "question", "short_answer", "time_label", "video_url"];
  const badRows = questions.filter(
    (row) =>
      !isRecord(row) ||
      requiredFields.some((field) => !isNonEmptyString(row[field])),
  );
  if (badRows.length > 0) {
    throw new Error(`Found ${badRows.length} generated question rows with missing required fields.`);
  }

  const badExpandedRows = questions.filter(
    (row) =>
      !isRecord(row) ||
      !isNonEmptyString(row.expanded_answer) ||
      /_Expansion pending\._/.test(row.expanded_answer),
  );
  if (badExpandedRows.length > 0) {
    throw new Error(
      `Found ${badExpandedRows.length} generated question rows with missing or pending expanded answers.`,
    );
  }

  return {
    sourceQuestionCount: sourceFiles.length,
    numberedPageCount,
    specialPageCount,
    generatedDescriptionCount: descriptions.filter(
      (record) => record.source === "generated_from_questions",
    ).length,
    overriddenDescriptionCount: descriptions.filter(
      (record) => record.source === "curated_override",
    ).length,
    questionRowCount: questions.length,
  };
}

export function printStaticSiteValidationSummary(summary: StaticSiteValidationSummary): void {
  console.log("Hugo compatibility validation passed.");
  console.log(`Source/generated pages: ${summary.sourceQuestionCount}`);
  console.log(
    `Numbered/special pages: ${summary.numberedPageCount}/${summary.specialPageCount}`,
  );
  console.log(
    `Generated/overridden descriptions: ${summary.generatedDescriptionCount}/${summary.overriddenDescriptionCount}`,
  );
  console.log(`Question rows: ${summary.questionRowCount}`);
}

async function markdownFiles(directory: string): Promise<string[]> {
  return (await readdir(directory, { withFileTypes: true }))
    .filter((entry) => entry.isFile() && entry.name.endsWith(".md"))
    .map((entry) => entry.name);
}

function isNumberedPage(path: string): boolean {
  return /^\d+-/.test(basename(path));
}

function parseJsonArray(text: string): unknown[] {
  const value: unknown = JSON.parse(text);
  if (!Array.isArray(value)) {
    throw new Error("Expected generated JSON data to contain an array.");
  }
  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}
