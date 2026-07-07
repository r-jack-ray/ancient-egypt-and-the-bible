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
  assert.equal(markedText("pharaoh", "Pharaohs and pharaoh"), "[Pharaohs] and [pharaoh]");
});

test("literal highlighting is token-prefix based", () => {
  assert.equal(markedText("avengers", "Avengers and scavengers seek revenge"), "[Avengers] and scavengers seek revenge");
});

test("literal highlighting includes configured token aliases", () => {
  assert.equal(markedText("pharoah", "Pharaoh and pharoah"), "[Pharaoh] and [pharoah]");
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

test("expanded-answer helper detects matches not represented in visible fields", () => {
  const highlightModel = core.buildHighlightModel("avengers tick", aliasIndex);

  assert.equal(
    core.hasUnrepresentedHighlightMatch(
      "The Tick is his favorite superhero, even though he once worked on an Avengers movie.",
      "Who is his favorite superhero? The Tick.",
      highlightModel
    ),
    true
  );

  assert.equal(
    core.hasUnrepresentedHighlightMatch(
      "The answer also mentions Avengers.",
      "Why do you hate Avengers movies?",
      highlightModel
    ),
    false
  );
});

test("shared matcher rejects substring and fuzzy-only matches", () => {
  const matchModel = core.createSearchMatchModel("Avengers", aliasIndex);

  assert.equal(core.matchesSearchText("Why do you hate Avengers movies?", matchModel), true);
  assert.equal(core.matchesSearchText("Dogs were scavengers and corpse eaters.", matchModel), false);
  assert.equal(core.matchesSearchText("Children might seek revenge later.", matchModel), false);
});

test("shared matcher accepts configured token and phrase aliases", () => {
  assert.equal(core.matchesSearchText("Pharaoh was mentioned.", core.createSearchMatchModel("pharoah", aliasIndex)), true);
  assert.equal(core.matchesSearchText("The Dead Sea Scrolls are relevant.", core.createSearchMatchModel("dss", aliasIndex)), true);
  assert.equal(core.matchesSearchText("DSS material is relevant.", core.createSearchMatchModel("dead sea scrolls", aliasIndex)), true);
});
