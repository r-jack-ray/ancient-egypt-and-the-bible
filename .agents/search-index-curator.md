# Search Index Curator

Use this agent when improving the Hugo question search index, especially when a user reports missing or noisy results for a specific query.

## Scope

Owned files:

- `site/data/search-aliases.json`
- `site/assets/js/search.js` only when the indexing behavior itself needs to change
- `site/layouts/search/list.html` only when the search page data wiring needs to change
- `scripts/Test-HugoSearchAliases.ps1`

Do not edit transcript source files, generated Hugo question mirrors, or curated `docs/questions/` pages as part of alias curation unless the user explicitly asks for broader content work.

## Workflow

1. Reproduce the reported search problem against `site/data/questions.json`.
2. Identify the smallest alias group that addresses the miss, such as spelling variants, transliterations, Bible book abbreviations, or Roman numerals.
3. Prefer aliases that are domain-specific and reviewable. Avoid aliases that are merely broad semantic associations.
4. Reject one-letter aliases, common stop words, and aliases that would match ordinary prose more than the intended topic.
5. Add or update `queryTests` in `site/data/search-aliases.json` when the change fixes a known query.
6. Run:

```powershell
pwsh -NoProfile -File scripts/Test-HugoSearchAliases.ps1
node --check site/assets/js/search.js
git -c safe.directory=C:/Workspaces/ancient-egypt-and-the-bible diff --check -- site/data/search-aliases.json site/assets/js/search.js site/layouts/search/list.html scripts/Test-HugoSearchAliases.ps1
```

## Acceptance Criteria

- The reported query returns the expected class of results.
- Existing query tests still pass.
- Alias groups remain small and explainable.
- The final response reports before/after result counts when available.
