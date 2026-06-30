# MiniSearch Alias Improvement Areas

Repository context: `site/data/search-aliases.json` supports bidirectional alias groups for the Hugo/MiniSearch site search. This file is intended as a set of focused Codex work groups, ordered from highest to lowest likely impact.

The goal is not to create a broad thesaurus. The goal is to remove likely search friction where a user types a reasonable term, abbreviation, spelling, transliteration, or reference form that may not exactly appear in the generated Q&A rows.

## General Rules for All Groups

Before adding aliases, have Codex check actual usage in:

- `site/data/search-aliases.json`
- `site/data/questions.json`, if generated locally
- `docs/questions/*.md`
- `src/transcripts/txt/*.txt`, when useful for finding recurring terminology

For each proposed alias group, Codex should classify it as one of:

1. **Safe lexical alias** — spelling, transliteration, plural/singular, abbreviation, or Roman numeral equivalent.
2. **Cautious related-term expansion** — terms often searched together but not always exact synonyms.
3. **Reject / do not alias** — too broad, interpretive, doctrinally loaded, or likely to pollute results.

Prefer adding safe lexical aliases first. Related-term expansions should be reviewed separately and may need a different mechanism later.

Codex should avoid:

- Very short aliases unless they are already proven safe.
- Common English words.
- Ambiguous theological equivalences.
- Place-name groups that imply disputed identifications.
- One term appearing in multiple alias groups.
- Multi-word phrase aliases unless the search script is improved to support phrase-level expansion.

---

## 1. Egyptian Name Transliteration Variants

**Expected impact:** Very high  
**Reason:** Egyptology names appear in many spellings across academic works, popular books, older translations, and biblical discussions.

### Current status

Partially completed on 2026-06-30 in `site/data/search-aliases.json`.

Already implemented and validated:

- `ramses` / `ramesses` / `rameses`.
- `thutmose` / `thutmosis` / `tuthmosis`.
- `amenhotep` / `amenophis`.
- `akhenaten` / `akhnaten`.
- `horemheb` / `haremhab`.
- `hatshepsut` / `hatchepsut`.
- `ahmose` / `ahmosis` / `amosis`.
- `amenemhat` / `amenemhet`.
- `senusret` / `senwosret` / `sesostris`.
- `khufu` / `cheops`.
- `khafre` / `chephren`.
- `menkaure` / `mycerinus`.
- `sobekhotep` / `sebekhotep`.
- `amun` / `amon`.
- `ramessid` / `ramesside` / `ramessides`.
- `merneptah` / `merenptah`.
- `seti` / `sety` / `sethos`.
- `setnakhte` / `setnakht`.
- `amenmesse` / `amenmesses`.
- `amunherkhepeshef` / `amunherkhepshef` / `amenherkhepeshef` / `amenherkhepshef`.

Validated query-test additions from this pass:

- `hatchepsut`: 0 -> 14 rows.
- `ahmosis`: 0 -> 18 rows.
- `amenemhet`: 0 -> 1 row.
- `sesostris`: 1 -> 3 rows.
- `cheops`: 0 -> 10 rows.
- `chephren`: 0 -> 4 rows.
- `mycerinus`: 0 -> 3 rows.
- `sebekhotep`: 0 -> 2 rows.
- `amon`: 0 -> 52 rows.

Do not add from this section without new evidence:

- `amun` / `amen`: `amen` is a common Semitic/English term in this corpus and would pollute results.
- `ra` / `re`: `re` appears in ordinary English contexts and is too noisy as a token alias.
- Broad deity equivalences such as Isis/Aset, Osiris/Asar, Horus/Heru, or Hathor variants unless site-data checks show the searched form needs the alias and does not create noisy matches.

### Scope

Have Codex look for recurring Egyptian personal names and royal names where alternate spellings are likely, excluding the completed and rejected groups above.

Focus areas:

- Pharaoh names.
- Royal family names.
- Egyptian officials.
- Egyptian deity names.
- Greek renderings of Egyptian names.
- Older spellings from older scholarship.
- Common `i/y`, `u/ou`, `k/c/q`, `s/z`, `ph/f`, and doubled-letter variants.

### Candidate categories

Do not blindly add these; use them as prompts for Codex research against the repository content. Most original high-value examples in this section are now implemented; future passes should focus on additional recurring names found in `site/data/questions.json` or `docs/questions`.

- Additional pharaoh or royal-family names not already listed in Current status.
- Egyptian officials and non-royal names with recurring alternate spellings.
- Greek renderings of Egyptian names not already implemented.
- Older spellings from older scholarship that users may search and that map cleanly to a current spelling.
- Deity-name variants only when they are genuine name spellings and the tokens are not common English words.

### Codex task direction

Ask Codex to:

1. Scan the question pages and transcripts for Egyptian names.
2. Identify names with common alternate spellings.
3. Propose only groups that are lexical variants, not merely related people.
4. Add query tests for high-value additions.
5. Run the alias validation script after changes.

### Guardrails

- Do not group different people merely because names are similar.
- Be careful with names that refer to multiple rulers.
- Avoid broad deity equivalences unless the terms are genuine name variants.
- Before adding a short deity token, inspect actual row hits; `re` and `amen` are known bad examples.

---

## 2. Place-Name and Site-Name Aliases

**Expected impact:** Very high  
**Reason:** Users may search by ancient name, biblical name, Greek name, modern Arabic site name, or excavation-site name.

### Scope

Have Codex look for locations that recur in the content and have well-known alternate names.

Focus areas:

- Egyptian cities.
- Delta sites.
- Nile Valley sites.
- Sinai locations.
- Levantine locations connected to Egypt.
- Biblical names connected to Egyptian geography.
- Archaeological tell names.
- Greek names versus Egyptian names.

### Candidate categories

Use these as discovery prompts, not automatic additions.

- Avaris / Tell el-Dab’a.
- Pi-Ramesses / Qantir.
- Thebes / Luxor / Waset.
- Memphis / Men-nefer.
- Heliopolis / On.
- Tanis / Zoan.
- Abydos variants.
- Elephantine / Yeb.
- Amarna / Akhetaten.

### Codex task direction

Ask Codex to:

1. Mine common place names from `docs/questions` and transcripts.
2. Separate exact name variants from disputed or contextual associations.
3. Propose conservative alias groups for exact variants only.
4. List related-but-not-exact terms separately for manual review.
5. Add query tests for a few high-value site aliases.

### Guardrails

- Do not alias disputed identifications as if they are certain.
- Be cautious with Goshen-related locations.
- Be cautious with Exodus-route locations.
- Avoid turning geographic interpretation into search equivalence.

---

## 3. Biblical Book Abbreviations and Reference Forms

**Expected impact:** High  
**Reason:** Users often search Bible references using abbreviations, numbered-book formats, or compact notation.

### Scope

Expand Bible-book abbreviation handling beyond the current set, prioritizing books that actually occur often in the Q&A data.

Focus areas:

- Pentateuch books.
- Historical books.
- Prophets.
- Psalms / wisdom literature.
- Gospels and Acts.
- Pauline letters.
- General epistles.
- Revelation / Apocalypse terminology.

### Candidate categories

Have Codex evaluate common abbreviations for:

- Genesis.
- Exodus.
- Leviticus.
- Numbers.
- Deuteronomy.
- Joshua.
- Judges.
- Samuel.
- Kings.
- Chronicles.
- Psalms.
- Isaiah.
- Jeremiah.
- Ezekiel.
- Daniel.
- Matthew.
- Mark.
- Luke.
- John.
- Acts.
- Romans.
- Corinthians.
- Hebrews.
- Peter.
- Revelation.

### Codex task direction

Ask Codex to:

1. Identify Bible books that occur in the site data.
2. Add abbreviation groups only for books with meaningful occurrence.
3. Consider whether numbered books require search-script improvement rather than plain aliases.
4. Add query tests for common reference patterns such as `ps 82`, `exod 12`, `isa 53`, etc.

### Guardrails

- Avoid single-letter aliases like `i`, `v`, or broad terms already blocked by validation.
- Be careful with `john`, which can mean a person, Gospel, epistles, or Revelation’s author depending on context.
- Do not rely on aliases alone for compact references like `ps82`; that likely needs query normalization.

---

## 4. Common Misspellings of Domain Terms

**Expected impact:** High  
**Reason:** MiniSearch fuzzy matching helps, but difficult Egyptian, biblical, and archaeological names are still easy to mistype.

### Scope

Target high-frequency difficult names and terms with predictable spelling errors.

Focus areas:

- Egyptian names.
- Biblical names.
- Archaeological terms.
- Ancient Near Eastern names.
- Names with doubled letters.
- Names with `ph/f`, `k/c/q`, `s/z`, `i/y`, `u/ou`, and silent-letter confusion.

### Candidate categories

Use repository content and likely user spellings to find candidates such as:

- Merneptah / Merenptah style variants.
- Nebuchadnezzar spelling variants.
- Amunherkhepeshef style variants.
- Horemheb / Haremhab style variants.
- Akhenaten spelling variants.
- Cherubim / cheribum-type errors only if common enough.

### Codex task direction

Ask Codex to:

1. Identify high-frequency difficult words in the Q&A data.
2. Suggest only misspellings likely enough to matter.
3. Avoid adding every possible typo.
4. Prefer misspelling aliases for names with many search-relevant results.
5. Add query tests for misspellings that should return known result ranges.

### Guardrails

- Do not add misspellings for low-frequency terms unless they are extremely likely.
- Avoid aliases that are themselves valid but unrelated words.
- Do not overfit to transcript auto-caption errors unless users are likely to search that way.

---

## 5. Ancient Texts, Inscriptions, and Source Abbreviations

**Expected impact:** Medium-high  
**Reason:** Users may search with academic abbreviations or common names of source texts.

### Scope

Look for named inscriptions, papyri, texts, and source collections that recur in the content.

Focus areas:

- Egyptian inscriptions.
- Stelae / stele variants.
- Papyri.
- Amarna material.
- Septuagint / Masoretic text references.
- Dead Sea Scrolls references.
- Ancient Near Eastern texts.

### Candidate categories

Use these as prompts:

- Septuagint / LXX.
- Masoretic Text / MT.
- Dead Sea Scrolls / DSS / Qumran.
- Amarna Letters / Amarna correspondence.
- Merneptah Stele / Israel Stele.
- Shasu / Shasu Yhw.
- Papyrus / papyri name variants.
- Stele / stela / stelae variants.

### Codex task direction

Ask Codex to:

1. Mine recurring named sources.
2. Identify abbreviations users are likely to type.
3. Separate source-name aliases from interpretive descriptions.
4. Consider phrase alias support for multi-word source names.
5. Add query tests for abbreviations like `lxx`, `mt`, and `dss` only if they produce useful results.

### Guardrails

- Avoid aliases that are too short and noisy unless strongly justified.
- Do not alias interpretive labels as if they are source names.
- Multi-word source names may need script changes rather than simple token aliases.

---

## 6. Biblical and Theological Term Variants

**Expected impact:** Medium-high  
**Reason:** Searchers from different backgrounds use different terms for related biblical concepts.

### Scope

Identify terms where alternate wording is likely and where search equivalence does not distort the content.

Focus areas:

- Angelic beings.
- Divine council language.
- Giants / Nephilim / Rephaim topics.
- Covenant language.
- Temple / tabernacle terms.
- Creation terminology.
- Messiah terminology.
- Afterlife terminology.

### Candidate categories

Use these as prompts, not automatic aliases:

- Cherub / cherubim / cherubs.
- Seraph / seraphim / seraphs.
- Nephilim / giants.
- Rephaim / giants / shades, with caution.
- Messiah / Christ / anointed.
- Tabernacle / tent of meeting.
- Sheol / Hades / underworld, with caution.
- Elohim / gods / divine beings, with caution.
- Divine council / council of gods, likely phrase-level or related-term handling.

### Codex task direction

Ask Codex to:

1. Identify recurring theological terms.
2. Separate strict lexical forms from interpretive or doctrinal associations.
3. Add only safe singular/plural/spelling groups to `aliasGroups`.
4. Put broader related-term suggestions in a separate review list.
5. Recommend whether a `relatedTerms` search layer would be better than aliases.

### Guardrails

- Do not make doctrinal conclusions through aliasing.
- Do not alias terms that Dr. Falk or guests distinguish in the content.
- Prefer plural/singular and spelling variants over conceptual equivalence.

---

## 7. Ancient-Language Terms and Transliteration Variants

**Expected impact:** Medium  
**Reason:** Some users may remember Hebrew, Greek, Egyptian, or academic transliterations rather than English descriptions.

### Scope

Add ASCII-safe variants for recurring original-language terms.

Focus areas:

- Hebrew terms.
- Greek terms.
- Egyptian terms.
- Transliterations with and without diacritics.
- Singular/plural forms.
- Academic shorthand.

### Candidate categories

Use these as prompts:

- Yahweh / YHWH.
- Elohim.
- Torah / law / instruction, with caution.
- Ruach / spirit / wind, with caution.
- Tanakh / Hebrew Bible / Old Testament, with caution.
- Septuagint / LXX.
- Masoretic / MT.
- Baal / Ba'al punctuation normalization.
- Dab’a / Daba / Dab'a punctuation normalization.

### Codex task direction

Ask Codex to:

1. Find recurring original-language terms.
2. Normalize diacritics and apostrophe variants where possible.
3. Recommend whether query normalization should handle punctuation before alias expansion.
4. Add only ASCII lowercase alphanumeric terms accepted by the validator.
5. Keep interpretive translations out of strict aliases unless clearly warranted.

### Guardrails

- Current alias validation allows only lowercase ASCII letters and digits.
- Do not force meaning-equivalence where a term has multiple possible meanings.
- Punctuation and diacritics are likely better handled in search normalization.

---

## 8. Chronology, Periodization, and Dynasty Terms

**Expected impact:** Medium  
**Reason:** Users may search by period names, dynasty numbers, or academic abbreviations.

### Scope

Improve searches around Egyptian chronology and broader ancient Near Eastern periodization.

Focus areas:

- Egyptian kingdom periods.
- Intermediate periods.
- Dynasty numbers.
- Bronze Age / Iron Age labels.
- Conventional abbreviations.
- Roman numerals in dynastic labels.

### Candidate categories

Use these as prompts:

- Old Kingdom / OK, probably too broad.
- Middle Kingdom / MK, caution.
- New Kingdom / NK, caution.
- Second Intermediate Period / SIP.
- Third Intermediate Period / TIP.
- Late Bronze Age / LBA.
- Iron Age / IA, probably too broad.
- Dynasty 18 / XVIII / eighteenth dynasty.
- Dynasty 19 / XIX / nineteenth dynasty.
- Dynasty 20 / XX / twentieth dynasty.

### Codex task direction

Ask Codex to:

1. Identify recurring period labels.
2. Determine whether short abbreviations are too noisy.
3. Prefer script-level phrase/reference handling over loose short aliases.
4. Add only abbreviations with acceptable result precision.
5. Add query tests for dynasty and period searches.

### Guardrails

- Short abbreviations can produce noise.
- Do not alias broad historical periods to specific dynasties.
- Roman numeral handling may be better generalized in the search script.

---

## 9. Recurring Scholars, Hosts, Guests, and Works

**Expected impact:** Medium-low  
**Reason:** Useful if users search for recurring people or works, but easy to make too broad.

### Scope

Identify recurring people, books, channels, and works that users might search by partial names or alternate forms.

Focus areas:

- Dr. Falk references.
- Guests.
- Scholars.
- Authors.
- Frequently cited works.
- Book-title abbreviations.
- Channel or podcast names.

### Candidate categories

Have Codex discover actual recurring names rather than guessing.

Potential forms:

- Full name / last name.
- Initials / full name.
- Common abbreviated title / full title.
- Older spelling / modern spelling.

### Codex task direction

Ask Codex to:

1. Mine recurring proper names and works.
2. Propose aliases only where the shortened form is likely and not ambiguous.
3. Avoid connecting a scholar to a theory as an alias.
4. Put author-work links in a separate related-search proposal.
5. Add query tests only for highly recurring people or works.

### Guardrails

- Do not alias people to ideas.
- Do not alias book titles to authors unless the search system supports related terms separately.
- Last-name-only aliases may be noisy.

---

## 10. MiniSearch Behavior Improvements Beyond Alias Data

**Expected impact:** Medium to very high, depending on implementation  
**Reason:** Some improvements cannot be solved cleanly with token alias groups.

### Scope

These are search-system improvements Codex can consider separately from alias expansion.

### High-value improvements

1. **Phrase aliases**
   - Support mappings such as `dead sea scrolls` ↔ `dss`.
   - Support `tent of meeting` ↔ `tabernacle` where appropriate.
   - Avoid stuffing multi-word concepts into token-only alias groups.

2. **One-way aliases**
   - Allow abbreviation searches to expand to full terms without making every full term behave like the abbreviation.
   - Example: `lxx` should find Septuagint, but `septuagint` does not necessarily need extra `lxx` weighting.

3. **Related-term layer**
   - Separate exact aliases from broader related terms.
   - Useful for theological concepts, disputed locations, author/work relationships, and topic clusters.

4. **Bible-reference parser**
   - Normalize `ps82`, `ps 82`, `psalm 82`, `psalms 82`.
   - Normalize `exod12`, `exod 12`, `exodus 12`.
   - Support numbered books such as `1sam`, `1 sam`, `first samuel`, `i samuel`.

5. **Roman numeral normalization**
   - Generalize `ii`, `iii`, `iv`, etc. rather than hard-coding only selected numbers.
   - Handle `ramses ii`, `ramesses 2`, `second ramses` style searches.

6. **Punctuation and diacritic normalization**
   - Normalize apostrophes, curly quotes, hyphens, and diacritics.
   - Improve searches for names like `Tell el-Dab’a`, `Ba'al`, and similar forms.

7. **Search diagnostics page or script**
   - Add a script that runs a curated list of expected searches and outputs result counts.
   - Track result count changes after alias updates.
   - Keep broad aliases from silently flooding search results.

### Codex task direction

Ask Codex to:

1. Review the current search script before changing alias data.
2. Identify which desired search improvements require code changes rather than JSON additions.
3. Propose small, testable enhancements.
4. Keep alias validation strict.
5. Add regression tests for representative searches.

### Guardrails

- Do not make the search magical enough to hide bad data.
- Keep exact alias matching and related-topic expansion distinct.
- Preserve understandable scoring and result order.

---

## Recommended Run Order

For focused Codex sessions, use this order:

1. Egyptian name transliteration variants.
2. Place-name and site-name aliases.
3. Biblical book abbreviations and reference forms.
4. Common misspellings of domain terms.
5. Ancient texts, inscriptions, and source abbreviations.
6. Biblical and theological term variants.
7. Ancient-language terms and transliteration variants.
8. Chronology, periodization, and dynasty terms.
9. Recurring scholars, hosts, guests, and works.
10. MiniSearch behavior improvements beyond alias data.

A good practical split would be one Codex session per group. For groups 6, 7, 8, and 9, ask Codex to produce a review list before editing because these are more likely to contain interpretive or noisy aliases.

---

## Suggested Codex Prompt Template

Use this template for each group:

```text
Review the Ancient Egypt and the Bible Hugo search alias setup for the focused group below.

Focused group:
<insert group title>

Goal:
Improve search recall without polluting results. Prefer safe lexical aliases: spellings, transliterations, singular/plural forms, abbreviations, and reference forms. Do not add broad conceptual synonyms unless they are clearly safe.

Files to inspect:
- site/data/search-aliases.json
- scripts/Test-HugoSearchAliases.ps1
- site/assets/js/search.js
- docs/questions/*.md
- site/data/questions.json if available locally
- src/transcripts/txt/*.txt if needed

Tasks:
1. Identify candidate alias groups relevant to this focused group.
2. Classify each as safe lexical alias, cautious related-term expansion, or reject.
3. Update site/data/search-aliases.json only for safe lexical aliases.
4. Add or update queryTests for important changes.
5. Run the alias validation script.
6. Report skipped candidates and why they were not added.

Guardrails:
- Do not add common English words or very short noisy aliases.
- Do not put the same alias term in multiple groups.
- Do not encode disputed identifications or interpretive claims as aliases.
- Do not add multi-word aliases unless the search script is first enhanced to support them.
```
