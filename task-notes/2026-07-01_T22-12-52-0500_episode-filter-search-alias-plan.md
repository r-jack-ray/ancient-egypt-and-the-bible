# Episode Filter Search Alias Plan

Timestamp: 2026-07-01T22:12:52-05:00

## Problem

The global Question Index and the per-episode question filter do not use the same search behavior.

Observed case:

- Global Question Index query: `ramses two`
- Result includes episode 154, question 20.
- Opening episode 154 and filtering the page with `ramses two` shows `0 shown`.

Cause:

- The Question Index uses MiniSearch plus aliases from `site/data/search-aliases.json`.
- The per-episode filter in `site/assets/js/site.js` uses a literal token substring check against each card's `data-filter-text`.
- `ramses` is aliased to `ramesses` in the global search index, but that alias is not applied by the per-episode filter.

This change should make per-page filtering use the same alias vocabulary as the Question Index.

## Scope

In scope:

- Make generic page filters in `site/assets/js/site.js` alias-aware when `QuestionSearchCore` and alias config are available.
- Load `site/assets/js/search-core.js` before `site/assets/js/site.js` in the shared base layout.
- Expose `site/data/search-aliases.json` to browser JavaScript as the shared alias config.
- Remove the duplicate `search-core.js` include from the search page if it becomes global.
- Carry the global Question Index search text into clicked question-page links so the destination page pre-fills its local filter.
- Validate episode 154 filter behavior for `ramses two`.

Out of scope:

- Do not add a broad `two -> ii -> 2` alias.
- Do not change transcript or curated question content.
- Do not change MiniSearch ranking.
- Do not add semantic aliases beyond the existing reviewed alias config.

## Proposed Implementation

1. Update `site/layouts/_default/baseof.html`.

   Add a small script before `site.js` that assigns the search alias data to a global, for example:

   ```html
   <script>
     window.QuestionSearchAliasConfig = {{ index site.Data "search-aliases" | jsonify | safeJS }};
   </script>
   ```

   Then load `search-core.js` before `site.js` in the shared head. This lets both the Question Index and ordinary page filters use the same core tokenization and alias helpers.

2. Update `site/layouts/search/list.html`.

   Remove the page-local `search-core.js` include from the `scripts` block if the base layout now loads it globally. Keep MiniSearch and `search.js` page-local.

3. Update `site/assets/js/search.js`.

   When rendering the result title link to `row.content_path`, append the user's current raw search text as a URL query parameter, for example `?q=ramses%20two`.

   Use the raw input value rather than the normalized MiniSearch query so the destination page shows exactly what the user typed. Keep the video timestamp link unchanged.

4. Update `site/layouts/questions/single.html`.

   Mark the per-episode question filter as hydratable from the `q` URL parameter, for example with `data-filter-param="q"`.

   Do not automatically hydrate every generic filter on the site unless it opts in. The intended path is from a global Question Index result into a specific question page.

5. Update `site/assets/js/site.js`.

   Keep the existing literal filter behavior as the fallback. When `window.QuestionSearchCore` is available:

   - On initialization, if a filter input has `data-filter-param`, read that query parameter from `window.location.search`, set the input value, and then apply the filter.
   - Build one alias index from `window.QuestionSearchAliasConfig`.
   - Normalize filter queries with `normalizeBibleReferenceQuery`.
   - Tokenize filter queries with the same token rules used by search aliases.
   - For each filter item, build an expanded haystack from:
     - existing `data-filter-text`
     - aliases returned by `core.getSearchAliases(...)`
   - Match every query token against the expanded haystack.

   This keeps current simple filters working while adding alias parity for cases like `ramses` matching visible or hidden `Ramesses` text.

6. Keep `ramses two` meaning literal `ramses` alias plus literal `two`.

   The expected episode-page result is not "Ramses II" normalization. It is "rows that contain a Ramses/Ramesses alias and the word `two` somewhere in the filter text."

## Expected Behavior

Before:

- Episode 154 page filter `ramses two`: `0 shown`

After:

- Episode 154 page filter `ramses two`: at least the 1:32:54 row is shown.
- Clicking the episode 154 result from the global Question Index with `ramses two` fills the episode-page filter with `ramses two` automatically.
- Existing literal filters such as `ark`, `postmodernism`, and `horemheb` continue to work.
- Global Question Index result counts should not change solely from this page-filter change.

## Validation Plan

Run static checks:

```powershell
node --check site/assets/js/search-core.js
node --check site/assets/js/site.js
node --check site/assets/js/search.js
pwsh -NoProfile -File scripts/Test-HugoSearchAliases.ps1
pwsh -NoProfile -File scripts/Test-HugoSite.ps1 -SkipHugo
git -c safe.directory=C:/Workspaces/ancient-egypt-and-the-bible diff --check -- site/layouts/_default/baseof.html site/layouts/search/list.html site/assets/js/site.js site/assets/js/search-core.js site/assets/js/search.js
```

Manual browser checks:

- Question Index query `ramses two` still returns episode 154.
- Clicking the episode 154 result from that query opens the question page with the local filter filled as `ramses two`.
- Episode 154 filter `ramses two` shows the row beginning `Which pharaohs did Moses live through...`.
- Episode 154 filter `ramesses two` also shows that row.
- Episode 154 filter `rameses two` also shows that row if the existing alias group supports it.
- Episode 154 filter `ramses ii` should not be treated as equivalent to `ramses two` unless a separate scoped Roman-numeral plan is approved.

## Risks

- Loading `search-core.js` globally slightly increases script loaded on non-search pages.
- Injecting alias config globally adds page weight; the current alias file is small enough that this is acceptable, but it should be checked after implementation.
- If Hugo cannot access `site/data/search-aliases.json` with the proposed `index site.Data "search-aliases"` expression, use the correct Hugo data lookup for hyphenated filenames instead of duplicating the alias data.
- Expanded-answer text is already included in episode card `data-filter-text`; alias-aware filtering may surface rows whose matching terms are hidden until the user clicks `Show expanded answers`. That is consistent with current filter behavior, but it can still feel surprising.
- Search-result links need careful URL handling so existing paths, base paths, and encoded user input are preserved.
- Auto-filling filters from URL parameters should be opt-in to avoid unexpectedly filtering the Episodes or Questions listing pages.

## Done Criteria

- Per-episode filters honor the same lexical alias groups as the global Question Index.
- Global Question Index result links can pass the search text into the destination episode page filter.
- No broad numeric or semantic aliasing is introduced.
- Episode 154 `ramses two` no longer shows `0 shown`.
- Static checks and search alias validation pass.
