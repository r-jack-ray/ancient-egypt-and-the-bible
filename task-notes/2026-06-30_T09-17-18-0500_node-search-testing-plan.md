# Node Search Testing Plan

Timestamp: 2026-06-30T09:17:18-05:00

## Review Update - 2026-07-01

- Current repo inventory still shows no root `package.json`, lockfile, or JavaScript test runner.
- Current JavaScript inventory is `site/assets/js/search.js` and `site/assets/js/site.js`.
- Local preflight found `node --version` working at `v22.23.1`, but `npm --version` failed because the global npm CLI path is broken. Keep direct `node` validation commands in the plan; treat npm-script validation as gated on fixing npm outside the repo environment.
- Current `scripts/Test-HugoSearchAliases.ps1` preflight fails before implementation because query `archeology` returns 260 rows against a max of 250. Fix or intentionally rebaseline that existing search test before treating it as a regression gate for the highlighting work.
- The original worktree command was ambiguous because it assumed the feature branch already existed. Use `git worktree add -b ... HEAD` when creating an isolated worktree and branch in one step.
- The search helper extraction should avoid mirrored logic. Prefer a small browser-and-Node-compatible helper module that both `search.js` and Node tests exercise.

## Purpose

Add lightweight Node-based test scaffolding for the Hugo search code, then implement alias-aware highlighting for search results. Keep the setup proportional to this repository: content and Hugo validation remain PowerShell-driven, while JavaScript behavior gets fast unit coverage.

## Constraints

- Keep transcript source files, generated Hugo question mirrors, and curated `docs/questions/` pages out of scope.
- Use `.agents/search-index-curator.md` for Hugo search behavior changes.
- Do the implementation on a dedicated Git feature branch, preferably named with the repo convention such as `codex/node-search-highlight-tests`.
- Use a separate Git worktree when this work should stay isolated from other active content curation or transcript-repair changes in the main checkout.
- Prefer Node's built-in test runner before adding Jest, Vitest, Playwright, or bundling.
- Keep direct `node --test` and `node --check` commands available even after adding npm scripts, because npm may be unavailable in a local environment.
- Avoid turning the repository into an application build pipeline.
- Keep existing PowerShell checks as the source of truth for content generation and Hugo compatibility.

## Phase 1 - Git Isolation

Goal: keep Node/tooling/search behavior changes separate from ongoing content work.

Tasks:

- Start by checking status in the current checkout:

```powershell
git -c safe.directory=C:/Workspaces/ancient-egypt-and-the-bible status --short
```

- If the current checkout is clean and available for this work, create a feature branch before editing tracked files:

```powershell
git -c safe.directory=C:/Workspaces/ancient-egypt-and-the-bible switch -c codex/node-search-highlight-tests
```

- If the main checkout is busy with unrelated content or transcript work, create a sibling worktree and feature branch in one step:

```powershell
git -c safe.directory=C:/Workspaces/ancient-egypt-and-the-bible worktree add -b codex/node-search-highlight-tests ../ancient-egypt-and-the-bible-node-search HEAD
```

- Run all later commands from whichever checkout or worktree owns the branch.
- Keep all Node scaffolding, JavaScript helper extraction, tests, and search-highlighting changes on that branch/worktree.
- Do not mix curated question-page repairs or transcript generation into this branch.

Validation:

```powershell
git -c safe.directory=C:/Workspaces/ancient-egypt-and-the-bible status --short
git -c safe.directory=C:/Workspaces/ancient-egypt-and-the-bible branch --show-current
```

## Phase 2 - Baseline Inventory

Goal: document the current JavaScript and validation surface before adding tooling.

Tasks:

- Confirm the repository still has no `package.json`, lockfile, or existing JavaScript test runner.
- Confirm local Node and npm availability:

```powershell
node --version
npm --version
```

- Require a Node version new enough for stable `node --test`; Node 20+ is sufficient, and the current reviewed environment has Node 22.
- If `npm --version` fails, continue validating with direct `node` commands and note that npm-script acceptance is blocked by the local Node/npm install, not by repository code.
- Review `site/assets/js/search.js`, especially tokenization, alias expansion, ranking, and `appendHighlightedText`.
- Review `site/assets/js/site.js` so the JavaScript syntax check covers all current site scripts.
- Review `site/layouts/search/list.html` for the script-loading order if a shared helper file is introduced.
- Review `site/data/search-aliases.json` for existing `ramses` / `ramesses` / `rameses` and `2` / `ii` alias coverage.
- Review `scripts/Test-HugoSearchAliases.ps1` and `scripts/Test-HugoSite.ps1` so Node tests complement rather than duplicate them.
- Run the search alias validator as a baseline. If it fails before any implementation edits, resolve or intentionally rebaseline the existing query test through the search-index-curator workflow before using it as a pass/fail gate for the highlight change.
- Capture current behavior for query `ramses 2`, including the fact that matching works but visible `II` is not highlighted.

Validation:

```powershell
git -c safe.directory=C:/Workspaces/ancient-egypt-and-the-bible status --short
rg --files -g "package*.json" -g "pnpm-lock.yaml" -g "yarn.lock" -g "bun.lockb"
node --version
npm --version
pwsh -NoProfile -File scripts/Test-HugoSearchAliases.ps1
node --check site/assets/js/search.js
node --check site/assets/js/site.js
```

## Phase 3 - Add Minimal Node Scaffolding

Goal: make JavaScript behavior testable with the smallest durable project setup.

Tasks:

- Add a root `package.json`.
- Mark the package as private.
- Add scripts for JavaScript validation and tests:

```json
{
  "private": true,
  "scripts": {
    "test": "node --test",
    "check:js": "node --check site/assets/js/search.js && node --check site/assets/js/site.js"
  }
}
```

- Do not add runtime dependencies unless a later phase proves they are necessary.
- Do not add a lockfile unless `npm install` or dependency installation becomes necessary.
- Do not run `npm install` merely to repair a broken global npm command; fix that environment issue outside the repo if npm scripts are required.
- When a shared helper file is added in Phase 4, update `check:js` to include it.
- Update README validation guidance only if the new commands are expected to become standard maintenance commands.

Validation:

```powershell
node --test
node --check site/assets/js/search.js
node --check site/assets/js/site.js
npm test
npm run check:js
```

## Phase 4 - Extract Testable Search Helpers

Goal: isolate pure search/highlight behavior while keeping browser behavior equivalent.

Tasks:

- Prefer adding a small shared helper file, such as `site/assets/js/search-core.js`, using a simple UMD-style wrapper:
  - Node tests can load it with `require`.
  - The browser can read it from `window.QuestionSearchCore`.
  - No bundler, transpiler, or runtime dependency is needed.
- Update `site/layouts/search/list.html` to load the helper before `site/assets/js/search.js` if a separate helper file is used.
- Move pure helper logic into the shared helper; do not keep a second mirrored copy in `search.js`.
- Candidate helper responsibilities:
  - normalize search text
  - tokenize search terms
  - normalize phrase aliases
  - build alias maps from `site/data/search-aliases.json`
  - derive phrase-aware highlight candidates from a query and alias config
  - derive highlight spans for visible result text
- Keep DOM mutation code in `site/assets/js/search.js`, but make its span calculation testable.
- Keep MiniSearch usage in `site/assets/js/search.js`; do not add MiniSearch as a Node dependency just to test highlighting helpers.

Acceptance criteria:

- Browser script remains valid with `node --check site/assets/js/search.js`.
- Shared helper remains valid with `node --check site/assets/js/search-core.js` if that file is added.
- Node tests import and exercise the same pure helper behavior used by the browser.
- No generated site content changes are introduced by this phase.

## Phase 5 - Add Focused Unit Tests

Goal: lock down the alias-aware highlighting behavior before implementation.

Tasks:

- Add a test file under a small JavaScript test directory, such as `tests/search-highlight.test.js` or `site/assets/js/search.test.js`.
- Use Node's built-in `node:test` and `node:assert/strict`.
- Add fixtures that use the real alias config or a minimal representative alias config.
- Cover at least these cases:
  - `ramses 2` highlights visible `Ramses II`.
  - `ramses 2` highlights visible `Ramesses II`.
  - `ramses 2` highlights visible `Rameses II` if that spelling appears.
  - `ramses 2` does not highlight unrelated `Amenhotep II`.
  - `ramses 2` does not highlight every one-character `2` or every visible `II`.
  - Literal highlighting still works for ordinary multi-character terms.
  - Existing one-character noise protection remains in effect for general token highlighting.
  - Highlight span offsets preserve the original visible casing and punctuation.
  - Overlapping phrase and token matches merge into the longest sensible mark range.

Validation:

```powershell
node --test
npm test
npm run check:js
```

## Phase 6 - Implement Alias-Aware Highlighting

Goal: make search-result highlighting explain alias matches without creating noisy highlights.

Tasks:

- In `site/assets/js/search.js`, compute highlight terms separately from raw search tokens.
- Prefer phrase-aware highlight spans over broad token expansion.
- Generate phrase candidates from adjacent query-token alias families, with a small cap on combinations to avoid broad highlight expansion.
- For query `ramses 2`, derive visible phrase candidates such as:
  - `ramses ii`
  - `ramesses ii`
  - `rameses ii`
- Treat one-character or generic numeric/Roman aliases as highlightable only when they participate in a multi-token phrase candidate.
- Highlight visible phrase matches first, then merge with ordinary literal token matches.
- Keep one-character aliases such as `2` and `ii` from becoming global standalone highlights unless they are part of a phrase match.
- Preserve existing rendering behavior for episode titles, questions, and short answers.
- Keep `search_aliases` as a hidden search field; do not display hidden alias text.
- If a shared helper file is used, keep `appendHighlightedText` as the DOM writer and delegate span calculation to the shared helper.

Acceptance criteria:

- Searching `ramses 2` highlights `Ramses II` or `Ramesses II` where those visible phrases occur.
- Searching `ramses 2` does not mark unrelated `II` in `Amenhotep II`.
- Existing alias matching result counts remain within the current `queryTests` bounds, after any pre-existing baseline failure has been resolved or intentionally rebaselined.
- Existing literal highlight behavior remains intact.

Validation:

```powershell
node --test
npm test
npm run check:js
pwsh -NoProfile -File scripts/Test-HugoSearchAliases.ps1
git -c safe.directory=C:/Workspaces/ancient-egypt-and-the-bible diff --check -- package.json site/assets/js/search-core.js site/assets/js/search.js site/layouts/search/list.html site/data/search-aliases.json scripts/Test-HugoSearchAliases.ps1
```

## Phase 7 - Optional Browser Smoke Check

Goal: verify the UX behavior in the actual Hugo page when local tooling is available.

Tasks:

- Run the existing Hugo site validation.
- If Hugo is installed, serve or build the site using the established project flow.
- Search `ramses 2` on the Question Index page.
- Confirm the first page of results visually:
  - relevant Ramses/Ramesses results appear
  - visible `Ramses II` / `Ramesses II` phrases are highlighted
  - unrelated `Amenhotep II` text is not highlighted solely because of `2 -> ii`
- If a shared helper file was added, confirm the browser loaded it before `search.js` and there are no console errors.

Validation:

```powershell
pwsh -NoProfile -File scripts/Test-HugoSite.ps1
```

If Hugo is not installed, run:

```powershell
pwsh -NoProfile -File scripts/Test-HugoSite.ps1 -SkipHugo
```

## Phase 8 - Implement Testing for Existing Project Structures

Goal: extend test coverage beyond the new search-highlight code to existing repository structures that already behave like contracts.

Tasks:

- Inventory existing project contracts that are currently checked only manually or inside broad scripts.
- Add focused tests or checks for stable structures, starting with:
  - `site/data/search-aliases.json` shape and alias safety rules
  - `site/data/questions.json` required row fields after Hugo content generation
  - generated question page count matching `docs/questions/*.md`
  - numbered versus special Hugo question page counts
  - search URL/data wiring in `site/layouts/search/list.html`
  - JavaScript syntax for all site JS files, not only `site/assets/js/search.js`
- Avoid moving content-generation contracts out of `scripts/Test-HugoSite.ps1`; Node tests should cover JavaScript/data behavior, not replace the PowerShell content pipeline.
- Decide case by case whether each check belongs in:
  - Node unit tests for JavaScript/data behavior
  - existing PowerShell validation for generated content and filesystem contracts
  - a new lightweight PowerShell script if the check is not JavaScript-specific
- Add npm scripts only for Node-owned checks. Keep PowerShell-owned checks callable from the existing validation scripts.
- Update README validation guidance once these checks are stable.

Acceptance criteria:

- Existing structural checks can be run without a full Hugo server when possible.
- The test split is clear: Node for JavaScript/data behavior, PowerShell for repository content and generation contracts.
- `scripts/Test-HugoSite.ps1` remains the broad compatibility command.
- New tests are fast enough to run during ordinary search-index maintenance.

Final validation:

```powershell
node --test
node --check site/assets/js/search.js
node --check site/assets/js/site.js
npm test
npm run check:js
pwsh -NoProfile -File scripts/Test-HugoSearchAliases.ps1
pwsh -NoProfile -File scripts/Test-HugoSite.ps1
git -c safe.directory=C:/Workspaces/ancient-egypt-and-the-bible diff --check
```

## Handoff Notes

- The likely first implementation target is `site/assets/js/search.js`.
- The likely first test target is phrase-aware span calculation, not DOM rendering.
- The likely lowest-duplication extraction path is a browser-and-Node-compatible `site/assets/js/search-core.js`, loaded before `search.js` and imported by Node tests.
- Do not expand every alias into highlight tokens. Phrase-aware aliases are necessary to avoid noisy highlights from generic Roman numerals.
- Keep direct `node` commands in validation because the reviewed local npm command is currently broken even though Node itself works.
- Add heavier browser or DOM tooling only after simple Node tests stop being enough.
