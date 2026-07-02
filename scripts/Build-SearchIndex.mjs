import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import MiniSearch from "minisearch";

const require = createRequire(import.meta.url);
const core = require("../site/assets/js/search-core.js");

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(process.argv[2] || path.join(scriptDir, ".."));
const siteDir = path.join(repoRoot, "site");
const questionsPath = path.join(siteDir, "data", "questions.json");
const aliasesPath = path.join(siteDir, "data", "search-aliases.json");
const minisearchPackagePath = path.join(repoRoot, "node_modules", "minisearch", "package.json");
const outputDir = path.join(siteDir, "static", "search");
const docsPath = path.join(outputDir, "docs.json");
const indexPath = path.join(outputDir, "index.json");
const manifestPath = path.join(outputDir, "manifest.json");

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function writeJson(filePath, value, options = {}) {
  const space = options.pretty ? 2 : 0;
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, space)}\n`, "utf8");
}

function compactDoc(row, index) {
  const doc = {
    search_id: index.toString(),
    episode_number: row.episode_number ?? null,
    episode_title: row.episode_title || "",
    is_numbered: Boolean(row.is_numbered),
    is_special: Boolean(row.is_special),
    row_index: row.row_index ?? null,
    content_path: row.content_path || "",
    question: row.question || "",
    short_answer: row.short_answer || "",
    time_label: row.time_label || "",
    video_url: row.video_url || ""
  };

  if (row.start_seconds !== undefined && row.start_seconds !== null) {
    doc.start_seconds = row.start_seconds;
  }

  return doc;
}

function indexDoc(row, displayDoc, aliasIndex) {
  const searchText = (row.search_text || [
    row.episode_number,
    row.episode_title,
    row.question,
    row.short_answer,
    row.expanded_answer
  ].join(" ")).toString().toLowerCase();

  return {
    search_id: displayDoc.search_id,
    episode_number_text: row.episode_number ? row.episode_number.toString() : "",
    episode_title: displayDoc.episode_title,
    question: displayDoc.question,
    short_answer: displayDoc.short_answer,
    search_text: searchText,
    search_aliases: core.getSearchAliases([
      row.episode_title,
      row.question,
      row.short_answer,
      searchText
    ].join(" "), aliasIndex)
  };
}

const questions = readJson(questionsPath);
const aliasConfig = core.readSearchAliasConfig(readJson(aliasesPath));
const aliasIndex = core.createSearchAliasIndex(aliasConfig);
const minisearchPackage = readJson(minisearchPackagePath);
const displayDocs = questions.map(compactDoc);
const indexDocs = questions.map((row, index) => indexDoc(row, displayDocs[index], aliasIndex));
const miniSearchOptions = core.createMiniSearchOptions();
const miniSearch = new MiniSearch(miniSearchOptions);

miniSearch.addAll(indexDocs);

fs.mkdirSync(outputDir, { recursive: true });
writeJson(docsPath, displayDocs);
writeJson(indexPath, miniSearch);
writeJson(manifestPath, {
  version: 1,
  generated_by: "scripts/Build-SearchIndex.mjs",
  source_data: "site/data/questions.json",
  source_aliases: "site/data/search-aliases.json",
  document_count: displayDocs.length,
  minisearch_version: minisearchPackage.version,
  index_url: "index.json",
  docs_url: "docs.json",
  display_fields: Object.keys(displayDocs[0] || {}),
  index_fields: miniSearchOptions.fields,
  store_fields: miniSearchOptions.storeFields,
  alias_config: aliasConfig
}, { pretty: true });

console.log(`Built search index for ${displayDocs.length.toLocaleString("en-US")} documents.`);
console.log(`Wrote ${path.relative(repoRoot, docsPath).replaceAll(path.sep, "/")}`);
console.log(`Wrote ${path.relative(repoRoot, indexPath).replaceAll(path.sep, "/")}`);
console.log(`Wrote ${path.relative(repoRoot, manifestPath).replaceAll(path.sep, "/")}`);
