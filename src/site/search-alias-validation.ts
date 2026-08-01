import { readFile, stat } from "node:fs/promises";
import { join, resolve } from "node:path";

export interface ValidateHugoSearchAliasesOptions {
  repoRoot?: string;
  maxRowsPerAliasGroup?: number;
  logger?: (message: string) => void;
}

export interface HugoSearchAliasValidationSummary {
  aliasGroupCount: number;
  phraseAliasGroupCount: number;
  questionRowCount: number;
  queryTestCount: number;
}

type JsonObject = Record<string, unknown>;

interface NormalizedPhraseAliasGroup {
  terms: string[];
  firstTokens: string[];
}

interface QuestionSearchRow {
  question: JsonObject;
  normalizedText: string;
  haystackSet: Set<string>;
}

const dangerousTerms = new Set([
  "a", "an", "and", "are", "as", "at", "be", "by", "for", "from", "he", "i", "in",
  "is", "it", "of", "on", "or", "she", "the", "they", "to", "was", "we", "what",
  "when", "where", "who", "why", "with", "x", "v",
]);

const numberedBookPattern =
  "sam|samuel|kgs|kings|chr|chron|chronicles|cor|corinthians|thess|thessalonians";
const bibleReferenceBooks = [
  "genesis", "exodus", "leviticus", "numbers", "deuteronomy", "joshua",
  "judges", "ruth", "samuel", "kings", "chronicles", "ezra", "nehemiah",
  "esther", "proverbs", "ecclesiastes", "lamentations", "isaiah",
  "jeremiah", "ezekiel", "hosea", "obadiah", "micah", "nahum", "haggai",
  "zechariah", "malachi", "matthew", "mark", "luke", "romans",
  "corinthians", "galatians", "ephesians", "philippians", "colossians",
  "thessalonians", "hebrews", "james", "jude", "revelation", "apocalypse",
  "chron", "exod", "deut", "josh", "judg", "esth", "prov", "eccl", "ezek",
  "obad", "zech", "matt", "thess", "psalms", "psalm", "gen", "lev", "num",
  "rth", "sam", "kgs", "chr", "ezr", "neh", "lam", "isa", "jer", "hos",
  "mic", "nah", "hag", "mal", "mrk", "rom", "cor", "gal", "eph", "phil",
  "col", "heb", "jas", "jud", "rev", "psa", "mk", "lk", "ps",
];
const bookPattern = [...bibleReferenceBooks]
  .sort((left, right) => right.length - left.length)
  .join("|");

export async function validateHugoSearchAliases(
  options: ValidateHugoSearchAliasesOptions = {},
): Promise<HugoSearchAliasValidationSummary> {
  const repoRoot = resolve(options.repoRoot ?? resolve(__dirname, "../.."));
  const maxRowsPerAliasGroup = options.maxRowsPerAliasGroup ?? 1_100;
  const logger = options.logger ?? console.log;
  if (!Number.isInteger(maxRowsPerAliasGroup)) {
    throw new Error("maxRowsPerAliasGroup must be an integer.");
  }

  const aliasPath = join(repoRoot, "site/data/search-aliases.json");
  const questionsPath = join(repoRoot, "site/data/questions.json");
  await requireFile(aliasPath, `Missing ${aliasPath}.`);
  await requireFile(
    questionsPath,
    `Missing ${questionsPath}. Run npm run build:site-content first.`,
  );

  const aliasConfig = jsonObject(JSON.parse(await readFile(aliasPath, "utf8")), aliasPath);
  const aliasGroups = stringGroups(aliasConfig.aliasGroups, "aliasGroups", aliasPath);
  if (aliasGroups.length === 0) {
    throw new Error(`No aliasGroups found in ${aliasPath}.`);
  }
  const phraseAliasGroups = aliasConfig.phraseAliasGroups === undefined
    ? []
    : stringGroups(aliasConfig.phraseAliasGroups, "phraseAliasGroups", aliasPath);
  const queryTests = aliasConfig.queryTests === undefined
    ? []
    : objectArray(aliasConfig.queryTests, "queryTests", aliasPath);

  validateAliasGroups(aliasGroups, phraseAliasGroups);

  const questions = objectArray(JSON.parse(await readFile(questionsPath, "utf8")), "questions", questionsPath);
  if (questions.length === 0) {
    throw new Error(`No question rows found in ${questionsPath}.`);
  }

  const aliasMap = searchAliasMap(aliasGroups);
  const normalizedPhraseAliasGroups = normalizePhraseAliasGroups(phraseAliasGroups);
  logger("Building search alias validation index...");
  const questionSearchRows: QuestionSearchRow[] = [];
  const tokenRowIndex = new Map<string, number[]>();
  const haystackRowIndex = new Map<string, number[]>();

  for (const question of questions) {
    const searchText = [
      stringValue(question.search_text),
      stringValue(question.episode_title),
      stringValue(question.question),
      stringValue(question.short_answer),
    ].join(" ");
    const tokens = searchTokens(searchText);
    const tokenSet = new Set(tokens);
    const normalizedText = ` ${tokens.join(" ")} `;
    const aliases = searchAliasesForText(
      tokens,
      tokenSet,
      normalizedText,
      aliasMap,
      normalizedPhraseAliasGroups,
    );
    const haystackSet = new Set(tokens);
    for (const alias of aliases) {
      for (const aliasToken of searchTokens(alias)) {
        haystackSet.add(aliasToken);
      }
    }

    const rowIndex = questionSearchRows.length;
    for (const term of tokenSet) addSearchIndexTerm(tokenRowIndex, term, rowIndex);
    for (const term of haystackSet) addSearchIndexTerm(haystackRowIndex, term, rowIndex);
    questionSearchRows.push({ question, normalizedText, haystackSet });
  }

  for (const group of aliasGroups) {
    const matchingRowCount = matchingRowCountForAnyIndexedTerm(tokenRowIndex, group);
    if (matchingRowCount > maxRowsPerAliasGroup) {
      throw new Error(
        `Alias group [${group.join(", ")}] matches ${matchingRowCount} rows; limit is ${maxRowsPerAliasGroup}.`,
      );
    }
  }

  for (const group of normalizedPhraseAliasGroups) {
    const candidateRows = new Set<number>();
    for (const firstToken of group.firstTokens) {
      for (const rowIndex of tokenRowIndex.get(firstToken) ?? []) candidateRows.add(rowIndex);
    }
    let matchingRowCount = 0;
    for (const rowIndex of candidateRows) {
      const row = questionSearchRows[rowIndex];
      if (row !== undefined && haystackContainsAnyPhrase(row.normalizedText, group.terms)) {
        matchingRowCount += 1;
      }
    }
    if (matchingRowCount > maxRowsPerAliasGroup) {
      throw new Error(
        `Phrase alias group [${group.terms.join(", ")}] matches ${matchingRowCount} rows; limit is ${maxRowsPerAliasGroup}.`,
      );
    }
  }

  for (const queryTest of queryTests) {
    validateQueryTest(queryTest, haystackRowIndex, questionSearchRows);
  }

  const summary: HugoSearchAliasValidationSummary = {
    aliasGroupCount: aliasGroups.length,
    phraseAliasGroupCount: phraseAliasGroups.length,
    questionRowCount: questions.length,
    queryTestCount: queryTests.length,
  };
  logger("Search alias validation passed.");
  logger(`Alias groups: ${summary.aliasGroupCount}`);
  logger(`Phrase alias groups: ${summary.phraseAliasGroupCount}`);
  logger(`Question rows: ${summary.questionRowCount}`);
  logger(`Query tests: ${summary.queryTestCount}`);
  return summary;
}

function validateAliasGroups(aliasGroups: readonly string[][], phraseAliasGroups: readonly string[][]): void {
  const seenTerms = new Set<string>();
  for (const [index, group] of aliasGroups.entries()) {
    const groupNumber = index + 1;
    if (group.length < 2) throw new Error(`Alias group ${groupNumber} must contain at least two terms.`);
    const localTerms = new Set<string>();
    for (const term of group) {
      if (term !== term.toLowerCase()) {
        throw new Error(`Alias group ${groupNumber} term '${term}' must be lowercase.`);
      }
      if (!/^[a-z0-9]+$/u.test(term)) {
        throw new Error(`Alias group ${groupNumber} term '${term}' must use only ASCII letters and digits.`);
      }
      if (term.length < 2 && !/^\d$/u.test(term)) {
        throw new Error(`Alias group ${groupNumber} term '${term}' is too short.`);
      }
      if (dangerousTerms.has(term)) {
        throw new Error(`Alias group ${groupNumber} term '${term}' is too broad for search aliases.`);
      }
      if (localTerms.has(term)) throw new Error(`Alias group ${groupNumber} repeats term '${term}'.`);
      if (seenTerms.has(term)) throw new Error(`Alias term '${term}' appears in more than one group.`);
      localTerms.add(term);
      seenTerms.add(term);
    }
  }

  for (const [index, rawGroup] of phraseAliasGroups.entries()) {
    const groupNumber = index + 1;
    const group = rawGroup.map(normalizeSearchPhrase);
    if (group.length < 2) {
      throw new Error(`Phrase alias group ${groupNumber} must contain at least two terms.`);
    }
    const localTerms = new Set<string>();
    for (const term of group) {
      if (!term.trim()) throw new Error(`Phrase alias group ${groupNumber} contains an empty term.`);
      if (term !== term.toLowerCase()) {
        throw new Error(`Phrase alias group ${groupNumber} term '${term}' must be lowercase.`);
      }
      if (!/^[a-z0-9]+( [a-z0-9]+)*$/u.test(term)) {
        throw new Error(
          `Phrase alias group ${groupNumber} term '${term}' must use only ASCII letters, numbers, and single spaces.`,
        );
      }
      if (term.length < 2) throw new Error(`Phrase alias group ${groupNumber} term '${term}' is too short.`);
      if (dangerousTerms.has(term)) {
        throw new Error(`Phrase alias group ${groupNumber} term '${term}' is too broad for search aliases.`);
      }
      if (localTerms.has(term)) {
        throw new Error(`Phrase alias group ${groupNumber} repeats term '${term}'.`);
      }
      if (seenTerms.has(term)) throw new Error(`Alias term '${term}' appears in more than one group.`);
      localTerms.add(term);
      seenTerms.add(term);
    }
  }
}

function validateQueryTest(
  queryTest: JsonObject,
  haystackRowIndex: ReadonlyMap<string, readonly number[]>,
  questionSearchRows: readonly QuestionSearchRow[],
): void {
  const query = stringValue(queryTest.query);
  const queryTokens = searchTokens(normalizeSearchQuery(query));
  if (queryTokens.length === 0) throw new Error("Query test has an empty query.");
  const matchingRowIndexes = matchingRowIndexesForAllIndexedTerms(
    haystackRowIndex,
    questionSearchRows,
    queryTokens,
  );
  const matchingRowCount = matchingRowIndexes.length;
  if (queryTest.minResults !== undefined) {
    const minimum = integerValue(queryTest.minResults, `Query '${query}' minResults`);
    if (matchingRowCount < minimum) {
      throw new Error(`Query '${query}' returned ${matchingRowCount} rows; expected at least ${minimum}.`);
    }
  }
  if (queryTest.maxResults !== undefined) {
    const maximum = integerValue(queryTest.maxResults, `Query '${query}' maxResults`);
    if (matchingRowCount > maximum) {
      throw new Error(`Query '${query}' returned ${matchingRowCount} rows; expected at most ${maximum}.`);
    }
  }
  if (queryTest.expectedMatches !== undefined) {
    const expectedMatches = normalizeObjectList(queryTest.expectedMatches, "expectedMatches");
    for (const expectedMatch of expectedMatches) {
      const found = matchingRowIndexes.some((rowIndex) => {
        const row = questionSearchRows[rowIndex];
        return row !== undefined && questionMatchesExpectedSearchResult(row.question, expectedMatch);
      });
      if (!found) {
        throw new Error(
          `Query '${query}' did not return expected match: ${formatExpectedSearchResult(expectedMatch)}.`,
        );
      }
    }
  }
}

function normalizeSearchQuery(value: string): string {
  let text = value.toLowerCase().trim();
  if (!text) return "";
  text = text.replace(new RegExp(`\\b(first|1st|i)\\s+(${numberedBookPattern})\\b`, "gu"), "1 $2");
  text = text.replace(new RegExp(`\\b(second|2nd|ii)\\s+(${numberedBookPattern})\\b`, "gu"), "2 $2");
  text = text.replace(new RegExp(`\\b(third|3rd|iii)\\s+(${numberedBookPattern})\\b`, "gu"), "3 $2");
  text = text.replace(new RegExp(`\\b([1-3])(${numberedBookPattern})(?=\\d|\\b)`, "gu"), "$1 $2");
  text = text.replace(new RegExp(`\\b(${bookPattern})(\\d+)`, "gu"), "$1 $2");
  return text.replace(/\s+/gu, " ").trim();
}

function searchTokens(value: string): string[] {
  return value.toLowerCase().replace(/<[^>]*>/gu, " ").match(/[a-z0-9]+/gu) ?? [];
}

function normalizeSearchPhrase(value: string): string {
  return searchTokens(value).join(" ");
}

function searchAliasMap(aliasGroups: readonly string[][]): Map<string, string[]> {
  const result = new Map<string, string[]>();
  for (const group of aliasGroups) {
    for (const term of group) result.set(term, group.filter((alias) => alias !== term));
  }
  return result;
}

function normalizePhraseAliasGroups(groups: readonly string[][]): NormalizedPhraseAliasGroup[] {
  const result: NormalizedPhraseAliasGroup[] = [];
  for (const group of groups) {
    const terms = group.map(normalizeSearchPhrase).filter(Boolean);
    if (terms.length === 0) continue;
    const firstTokens = new Set<string>();
    for (const term of terms) {
      const firstToken = searchTokens(term)[0];
      if (firstToken !== undefined) firstTokens.add(firstToken);
    }
    result.push({ terms, firstTokens: [...firstTokens] });
  }
  return result;
}

function searchAliasesForText(
  tokens: readonly string[],
  tokenSet: ReadonlySet<string>,
  normalizedText: string,
  aliasMap: ReadonlyMap<string, readonly string[]>,
  phraseAliasGroups: readonly NormalizedPhraseAliasGroup[],
): string[] {
  const aliases = new Set<string>();
  for (const token of tokens) {
    for (const alias of aliasMap.get(token) ?? []) aliases.add(alias);
  }
  for (const group of phraseAliasGroups) {
    if (group.terms.length < 2 || !group.firstTokens.some((token) => tokenSet.has(token))) continue;
    if (!group.terms.some((term) => normalizedText.includes(` ${term} `))) continue;
    for (const alias of group.terms) aliases.add(alias);
  }
  return [...aliases];
}

function addSearchIndexTerm(index: Map<string, number[]>, term: string, rowIndex: number): void {
  const rows = index.get(term);
  if (rows === undefined) index.set(term, [rowIndex]);
  else rows.push(rowIndex);
}

function matchingRowCountForAnyIndexedTerm(
  index: ReadonlyMap<string, readonly number[]>,
  terms: readonly string[],
): number {
  const rows = new Set<number>();
  for (const term of terms) {
    for (const rowIndex of index.get(term) ?? []) rows.add(rowIndex);
  }
  return rows.size;
}

function matchingRowIndexesForAllIndexedTerms(
  index: ReadonlyMap<string, readonly number[]>,
  questionSearchRows: readonly QuestionSearchRow[],
  terms: readonly string[],
): number[] {
  let candidateRows: readonly number[] | undefined;
  for (const term of terms) {
    const rows = index.get(term);
    if (rows === undefined) return [];
    if (candidateRows === undefined || rows.length < candidateRows.length) candidateRows = rows;
  }
  if (candidateRows === undefined) return [];
  return candidateRows.filter((rowIndex) => {
    const row = questionSearchRows[rowIndex];
    return row !== undefined && terms.every((term) => row.haystackSet.has(term));
  });
}

function haystackContainsAnyPhrase(haystack: string, terms: readonly string[]): boolean {
  return terms.some((term) => haystack.includes(` ${term} `));
}

function questionMatchesExpectedSearchResult(question: JsonObject, expected: JsonObject): boolean {
  if (
    expected.questionPage !== undefined &&
    stringValue(question.question_page) !== stringValue(expected.questionPage)
  ) return false;
  if (
    expected.timeLabel !== undefined &&
    stringValue(question.time_label) !== stringValue(expected.timeLabel)
  ) return false;
  if (expected.questionContains !== undefined) {
    const questionText = stringValue(question.question).toLowerCase();
    if (!questionText.includes(stringValue(expected.questionContains).toLowerCase())) return false;
  }
  return true;
}

function formatExpectedSearchResult(expected: JsonObject): string {
  const parts: string[] = [];
  for (const propertyName of ["questionPage", "timeLabel", "questionContains"] as const) {
    if (expected[propertyName] !== undefined) {
      parts.push(`${propertyName}='${stringValue(expected[propertyName])}'`);
    }
  }
  return parts.length === 0 ? "<empty expected match>" : parts.join(", ");
}

function stringGroups(value: unknown, name: string, path: string): string[][] {
  if (!Array.isArray(value)) throw new Error(`${name} in ${path} must be an array.`);
  return value.map((group, index) => {
    if (!Array.isArray(group)) throw new Error(`${name}[${index}] in ${path} must be an array.`);
    return group.map(stringValue);
  });
}

function objectArray(value: unknown, name: string, path: string): JsonObject[] {
  if (!Array.isArray(value)) throw new Error(`${name} in ${path} must be an array.`);
  return value.map((item, index) => jsonObject(item, `${path} ${name}[${index}]`));
}

function normalizeObjectList(value: unknown, name: string): JsonObject[] {
  if (value === null) return [];
  const values = Array.isArray(value) ? value : [value];
  return values.map((item, index) => jsonObject(item, `${name}[${index}]`));
}

function jsonObject(value: unknown, label: string): JsonObject {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`${label} must be an object.`);
  }
  return value as JsonObject;
}

function stringValue(value: unknown): string {
  return value === null || value === undefined ? "" : String(value);
}

function integerValue(value: unknown, label: string): number {
  const result = Number(value);
  if (!Number.isInteger(result)) throw new Error(`${label} must be an integer.`);
  return result;
}

async function requireFile(path: string, message: string): Promise<void> {
  try {
    if ((await stat(path)).isFile()) return;
  } catch (error) {
    if (!isMissing(error)) throw error;
  }
  throw new Error(message);
}

function isMissing(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT";
}
