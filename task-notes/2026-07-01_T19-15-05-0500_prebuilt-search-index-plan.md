# Prebuilt Search Index Plan

Timestamp: 2026-07-01T19:15:05-05:00

## Goal

Move expensive search setup from the visitor's browser into the local build process, so the `/search/` page no longer inlines the full question payload or computes aliases and the MiniSearch index on page load.

## Current Problem

- `/search/` currently inlines all question rows in the HTML.
- `site/data/questions.json` is about 18.5 MB and contains 11,770 rows.
- Browser startup work includes JSON parsing, per-row alias expansion, MiniSearch index construction, and default result rendering.
- The recent highlighting code can add render work, but the larger load cost is the full payload and search setup.

## Files Likely To Touch

- `package.json`
- `site/assets/js/search.js`
- `site/assets/js/search-core.js`
- `site/layouts/search/list.html`
- `scripts/Build-HugoSiteContent.ps1`
- New script, likely `scripts/Build-SearchIndex.mjs`
- New generated static files under `site/static/search/`

## Plan

1. Baseline current behavior.
   - Record `/search/` HTML size.
   - Record `site/data/questions.json` size and row count.
   - Capture rough local load/setup timing.
   - Keep representative regression queries for normal terms, alias terms, phrase aliases, Bible references, empty query, and episode filters.

2. Add build-time index generation.
   - Add a Node script that reads `site/data/questions.json` and `site/data/search-aliases.json`.
   - Reuse `site/assets/js/search-core.js` for alias expansion and query normalization.
   - Build MiniSearch in Node with the same fields, boosts, fuzzy/prefix options, and `search_id` mapping.
   - Write generated static outputs:
     - `site/static/search/index.json`
     - `site/static/search/docs.json`
     - `site/static/search/manifest.json`

3. Slim the display payload.
   - Keep only fields needed to render results:
     - `search_id`
     - `episode_number`
     - `episode_title`
     - `is_numbered`
     - `is_special`
     - `row_index`
     - `content_path`
     - `question`
     - `short_answer`
     - `time_label`
     - `video_url`
     - optional `start_seconds`
   - Do not ship `expanded_answer` as display data.
   - Do not ship duplicated `search_text` to the browser unless it is still required by client-side fallback logic.

4. Update the search template.
   - Remove the inline `question-search-data` JSON blob from `site/layouts/search/list.html`.
   - Replace it with lightweight URL configuration such as:
     - `data-search-index-url`
     - `data-search-docs-url`
     - `data-search-manifest-url`
   - Continue loading MiniSearch, `search-core.js`, and `search.js`.

5. Update browser search behavior.
   - Fetch manifest, docs, and prebuilt index on page load.
   - Hydrate MiniSearch from the serialized index.
   - Render default empty-query results from slim docs, sorted newest first.
   - Run user searches against the hydrated index.
   - Preserve filters, sorting, load-more, URL hydration, and highlighting.
   - Add loading and error states for failed or pending fetches.

6. Wire the build.
   - Make `scripts/Build-HugoSiteContent.ps1` call the new index builder after writing `site/data/questions.json`.
   - Add an npm script such as `build:search-index` if useful.
   - Decide whether to add `minisearch` as a dev dependency so build-time indexing does not depend on the CDN.

7. Validate.
   - Add or update Node tests for serialized-index loading, representative query parity, aliases, phrase aliases, compact Bible references, and highlighting.
   - Run:
     - `npm run check:js`
     - `npm test`
     - `pwsh -NoProfile -File scripts/Test-HugoSite.ps1 -SkipHugo`
     - `git diff --check`
   - Treat `scripts/Test-HugoSearchAliases.ps1` carefully because `archeology` has a known baseline max-count issue in recent memory.

## Acceptance Targets

- `/search/` HTML drops from about 17 MB to a small shell page.
- Browser no longer computes aliases for every row on load.
- Browser no longer builds MiniSearch from raw rows on load.
- Search remains complete across the full corpus after static index files load.
- Expanded answers remain searchable only if included in the prebuilt index; they do not need to be shipped as result display payload.

## Follow-Up Option

If the serialized index plus slim docs are still too large, add sharding later by episode range or newest-first background loading. Start with one prebuilt slim index first to preserve behavior with less implementation risk.
