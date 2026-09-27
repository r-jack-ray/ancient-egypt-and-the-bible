const assert = require("node:assert/strict");
const {execFileSync} = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const MiniSearch = require("minisearch");

const core = require("../site/assets/js/search-core.js");

const episodes = [
  {content_path: "questions/second-fixture/"},
  {content_path: ""},
  {content_path: "questions/first-fixture/"}
];
const questions = [
  {question: "What is discussed about Ramesses II?", expanded_answer: "The fixture answer mentions Exodus."},
  {question: "What are the Dead Sea Scrolls?"},
  {question: "What does the Papyrus Westcar contain?"},
  {question: "What does Psalm 82 describe?"},
  {question: "What does Exodus 12 describe?"}
].map((row, index) => ({
  episode_number: index === 0 ? 1 : 2,
  episode_title: "Fixture episode",
  is_numbered: true,
  is_special: false,
  row_index: index + 1,
  content_path: index === 0 ? "questions/first-fixture/" : "questions/second-fixture/",
  short_answer: "A fixture short answer.",
  expanded_answer: "A fixture expanded answer.",
  time_label: "0:10",
  start_seconds: 10,
  video_url: "https://youtu.be/abcdefghijk?t=10",
  ...row
}));
const aliasConfig = {
  aliasGroups: [
    ["ramses", "ramesses"],
    ["2", "ii"],
    ["ps", "psalm"],
    ["exod", "exodus"]
  ],
  phraseAliasGroups: [
    ["dss", "dead sea scrolls"],
    ["westcar papyrus", "papyrus westcar"]
  ]
};
let fixtureRoot;
let manifest;
let docs;
let miniSearch;

test.before(() => {
  fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), "aeb-search-index-"));
  for (const [relativePath, value] of [
    ["site/data/questions.json", questions],
    ["site/data/episodes.json", episodes],
    ["site/data/search-aliases.json", aliasConfig],
    ["node_modules/minisearch/package.json", {version: "0.0.0-fixture"}]
  ]) {
    const filePath = path.join(fixtureRoot, relativePath);
    fs.mkdirSync(path.dirname(filePath), {recursive: true});
    fs.writeFileSync(filePath, JSON.stringify(value), "utf8");
  }
  execFileSync(process.execPath, [path.join(__dirname, "../scripts/build-search-index.mjs"), fixtureRoot]);
  manifest = JSON.parse(fs.readFileSync(path.join(fixtureRoot, "site/static/search/manifest.json"), "utf8"));
  docs = JSON.parse(fs.readFileSync(path.join(fixtureRoot, "site/static/search/docs.json"), "utf8"));
  const indexData = JSON.parse(fs.readFileSync(path.join(fixtureRoot, "site/static/search/index.json"), "utf8"));
  miniSearch = MiniSearch.loadJS(indexData, core.createMiniSearchOptions());
});

test.after(() => {
  if (fixtureRoot) fs.rmSync(fixtureRoot, {recursive: true, force: true});
});

function search(query) {
  return miniSearch.search(core.normalizeBibleReferenceQuery(query));
}

test("prebuilt search docs match source row count and keep display fields only", () => {
  assert.equal(manifest.minisearch_version, "0.0.0-fixture");
  assert.equal(manifest.document_count, questions.length);
  assert.equal(docs.length, questions.length);
  assert.equal(docs[0].search_id, "0");
  assert.equal(docs[0].expanded_answer, questions[0].expanded_answer);
  assert.ok(!Object.hasOwn(docs[0], "search_text"));
  assert.ok(!Object.hasOwn(docs[0], "search_aliases"));
});

test("serialized MiniSearch index loads and returns source-backed results", () => {
  const results = search("exodus");

  assert.deepEqual(results.map((result) => result.id).sort(), ["0", "4"]);
  assert.ok(results.every((result) => docs.some((doc) => doc.search_id === result.id)));
});

test("search manifest preserves the Episodes directory order for every question page", () => {
  const expectedPaths = episodes.filter((episode) => episode.content_path).map((episode) => episode.content_path);
  assert.deepEqual(manifest.episode_order, expectedPaths);
  const paths = new Set(manifest.episode_order);
  assert.equal(paths.size, expectedPaths.length);
  assert.ok(docs.every((doc) => paths.has(doc.content_path)));
});

test("prebuilt index preserves token aliases and phrase aliases", () => {
  assert.deepEqual(search("ramses 2").map((result) => result.id), ["0"]);
  assert.deepEqual(search("dss").map((result) => result.id), ["1"]);
  assert.deepEqual(search("westcar papyrus").map((result) => result.id), ["2"]);
});

test("prebuilt index preserves compact Bible reference normalization", () => {
  assert.deepEqual(search("ps82").map((result) => result.id), ["3"]);
  assert.deepEqual(search("exod12").map((result) => result.id), ["4"]);
});

test("serialized index does not return fuzzy-only results for exact terms", () => {
  const fixtureIndex = new MiniSearch(core.createMiniSearchOptions());
  fixtureIndex.addAll([
    {search_id: "exact-question", question: "Why do you like Avengers movies?"},
    {search_id: "exact-answer", search_text: "My favorite movie is Avengers."},
    {search_id: "fuzzy-scavengers", question: "What do scavengers eat?"},
    {search_id: "fuzzy-avenger", question: "Who is the avenger?"}
  ]);
  const serializedIndex = JSON.parse(JSON.stringify(fixtureIndex));
  const loadedIndex = MiniSearch.loadJS(serializedIndex, core.createMiniSearchOptions());
  const results = loadedIndex.search("avengers");

  assert.deepEqual(results.map((result) => result.id).sort(), ["exact-answer", "exact-question"]);
  assert.ok(results.every((result) => result.terms.includes("avengers")));
});
