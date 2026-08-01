---
name: search-index-curator
description: Reproduce, diagnose, fix, and validate Ancient Egypt and the Bible Hugo search behavior. Use when search misses a term, returns noisy results, needs a spelling or transliteration alias, mishandles Bible references, needs query smoke tests, or requires changes to the search index, normalization, highlighting, or search-page wiring.
---

# Search Index Curator

Use the smallest change that fixes the reported search behavior and leaves unrelated content untouched.

## Owned Surface

- `site/data/search-aliases.json` for domain-specific spelling, transliteration, abbreviation, and phrase aliases
- `site/assets/js/search-core.js` for normalization, matching, alias expansion, ranking support, and highlighting logic
- `site/assets/js/search.js` only for browser-side orchestration and UI behavior
- `site/layouts/search/list.html` only for search-page data wiring or markup
- `scripts/Build-SearchIndex.mjs` when index generation itself must change
- `src/site/search-alias-validation.ts` and `tests/search-*.test.js` for regression coverage

Do not edit transcript sources, curated `docs/questions/` pages, generated `site/content/questions/` mirrors, `site/data/questions.json`, or files under `site/static/search/` merely to force a result. Regenerate derived search files through the repository scripts.

## Workflow

1. Reproduce the reported query against the current generated search data and record the result count or failure mode.
2. Identify the narrowest responsible layer:
   - use an alias for a domain-specific equivalent or spelling variant;
   - change `search-core.js` for normalization, matching, or highlighting behavior;
   - change `search.js` or the layout only for UI or data-wiring defects;
   - change the index builder only when generated index semantics are wrong.
3. Reject one-letter aliases, common stop words, and broad semantic associations that would match ordinary prose more often than the intended topic.
4. Add or update `queryTests` in `site/data/search-aliases.json` for known query expectations. Add a Node regression test when code behavior changes.
5. Regenerate the search index when source data, aliases, or index-generation behavior requires it.
6. Run the relevant validation commands and compare the fixed query's result count with the baseline.

## Validation

Run:

```powershell
npm run check:search-aliases
npm test
npm run check:js
git -c safe.directory=C:/Workspaces/ancient-egypt-and-the-bible diff --check -- site/data/search-aliases.json site/assets/js/search-core.js site/assets/js/search.js site/layouts/search/list.html scripts/Build-SearchIndex.mjs src/site/search-alias-validation.ts tests
```

Run `npm run build:search-index` before validation when the change affects aliases, source search data, or index generation. Run `npm run check:site:static` when layouts, generated compatibility content, or site wiring changes.

For changes to `search.js`, the search layout, or browser-side data wiring, run the site and exercise the affected query in the in-app browser when available. Record the visible result count and confirm filters, highlighting, empty states, and load-more behavior relevant to the change. If a browser runtime is unavailable, report that limitation and complete the static site check.

## Completion

- The reported query returns the expected class of results.
- Existing query tests and Node tests pass.
- Browser-visible behavior is verified for UI or wiring changes when a runnable site is available.
- Alias groups remain narrow and explainable.
- No generated or curated content was edited as a search workaround.
- The final response includes the before/after result count when available, changed files, checks, and any material caveat.
