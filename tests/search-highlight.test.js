const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const core = require("../site/assets/js/search-core.js");
const aliasConfig = JSON.parse(fs.readFileSync(path.join(__dirname, "../site/data/search-aliases.json"), "utf8"));
const aliasIndex = core.createSearchAliasIndex(aliasConfig);

function spansFor(query, text) {
  const normalizedQuery = core.normalizeBibleReferenceQuery(query);
  const highlightModel = core.buildHighlightModel(normalizedQuery, aliasIndex);
  return core.getHighlightSpans(text, highlightModel);
}

function markedText(query, text) {
  const spans = spansFor(query, text);
  let cursor = 0;
  let output = "";

  spans.forEach((span) => {
    output += text.slice(cursor, span.start);
    output += "[" + text.slice(span.start, span.end) + "]";
    cursor = span.end;
  });

  return output + text.slice(cursor);
}

test("ramses 2 highlights visible Ramses II spellings", () => {
  assert.equal(markedText("ramses 2", "Ramses II and the Exodus"), "[Ramses II] and the Exodus");
  assert.equal(markedText("ramses 2", "Ramesses II chronology"), "[Ramesses II] chronology");
  assert.equal(markedText("ramses 2", "Rameses II in the question"), "[Rameses II] in the question");
});

test("ramses 2 does not highlight unrelated Roman numerals", () => {
  assert.equal(markedText("ramses 2", "Amenhotep II and Thutmose II"), "Amenhotep II and Thutmose II");
  assert.equal(markedText("ramses 2", "Part II has 2 notes"), "Part II has 2 notes");
});

test("literal highlighting still works for ordinary terms", () => {
  assert.equal(markedText("exodus", "The Exodus question"), "The [Exodus] question");
  assert.equal(markedText("pharaoh", "Pharaohs and pharaoh"), "[Pharaoh]s and [pharaoh]");
});

test("one-character query tokens stay out of general literal highlighting", () => {
  assert.equal(markedText("2", "2 II Ramses II"), "2 II Ramses II");
});

test("highlight spans preserve original casing and punctuation", () => {
  assert.deepEqual(spansFor("ramses 2", "Did Ramses-II rule?"), [{ start: 4, end: 13 }]);
  assert.equal(markedText("ramses 2", "Did Ramses-II rule?"), "Did [Ramses-II] rule?");
});

test("overlapping phrase and token matches merge into the longest range", () => {
  assert.equal(markedText("ramses 2", "Ramses II, Ramses alone"), "[Ramses II], [Ramses] alone");
});
