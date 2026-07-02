const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const MiniSearch = require("minisearch");

const core = require("../site/assets/js/search-core.js");

const repoRoot = path.join(__dirname, "..");
const manifest = JSON.parse(fs.readFileSync(path.join(repoRoot, "site/static/search/manifest.json"), "utf8"));
const docs = JSON.parse(fs.readFileSync(path.join(repoRoot, "site/static/search/docs.json"), "utf8"));
const indexData = JSON.parse(fs.readFileSync(path.join(repoRoot, "site/static/search/index.json"), "utf8"));
const questions = JSON.parse(fs.readFileSync(path.join(repoRoot, "site/data/questions.json"), "utf8"));
const miniSearch = MiniSearch.loadJS(indexData, core.createMiniSearchOptions());

function search(query) {
  return miniSearch.search(core.normalizeBibleReferenceQuery(query));
}

test("prebuilt search docs match source row count and stay display-only", () => {
  assert.equal(manifest.document_count, questions.length);
  assert.equal(docs.length, questions.length);
  assert.equal(docs[0].search_id, "0");
  assert.ok(!Object.hasOwn(docs[0], "expanded_answer"));
  assert.ok(!Object.hasOwn(docs[0], "search_text"));
  assert.ok(!Object.hasOwn(docs[0], "search_aliases"));
});

test("serialized MiniSearch index loads and returns source-backed results", () => {
  const results = search("exodus");

  assert.ok(results.length > 100);
  assert.ok(docs.some((doc) => doc.search_id === results[0].id));
});

test("prebuilt index preserves token aliases and phrase aliases", () => {
  assert.ok(search("ramses 2").length >= 50);
  assert.ok(search("dss").length >= 20);
  assert.ok(search("westcar papyrus").length >= 1);
});

test("prebuilt index preserves compact Bible reference normalization", () => {
  assert.ok(search("ps82").length >= 1);
  assert.ok(search("exod12").length >= 1);
});
