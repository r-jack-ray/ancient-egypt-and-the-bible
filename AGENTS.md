# Repository Guidelines

## Project Structure & Module Organization

This repository is a Questions & Answers reference archive for the Ancient Egypt and the Bible livestreams, not an application. The main source data and public reference pages live under `src/` and `docs/`.

- `src/channel/episodes.json`: canonical archive membership, stable video IDs, titles, slugs, order, and `fileStem` values.
- `src/transcripts/manifest.json`: canonical TXT payload facts and video-ID-to-file mapping.
- `src/transcripts/txt/`: canonical transcript payloads, one indexed/timestamped segment per line, and the default curation surface.
- `docs/questions/`: canonical curated GitHub-readable Q&A reference pages with timestamp links, short answers, and filled transcript-grounded expanded answers.
- `site/`: Hugo compatibility site. `site/content/questions/_index.md` is handwritten and tracked; the other question Markdown files are generated front-matter stubs, ignored by Git, and must not be edited or committed.
- `tests/`: Node test coverage for the generated search index and client-side search behavior.
- `src/scripts/`: Node 22.19+ and strict TypeScript inventory, transcript acquisition, reporting, site generation, and validation CLIs.
- `reports/`: ignored generated reports, validation output, smoke-test output, and triage artifacts.
- `task-notes/`: transient in-project notes, AI session summaries, and temporary human task documentation. Create this directory if it is missing.

There is no server application or conventional application module tree. The repository does have Node-based search tooling, automated search tests, and a Hugo build/deployment pipeline.

## Build, Test, and Development Commands

Transcript curation has no compile step. The Hugo/search surfaces do have build and validation commands:

```powershell
rg "search term" src/transcripts docs/questions
Get-Content docs/questions/208-super-chat-questions.md
npm run check:transcript-store
npm run fetch:livestreams
npm run fetch:transcripts -- --dry-run
npm run build:site-content
npm run check:question-tables
npm test
npm run check:quick
npm run check
npm run check:ci
npm run check:js
npm run check:site:static
git -c safe.directory=C:/Workspaces/ancient-egypt-and-the-bible status --short
```

Repository editing rules:

- Use `rg` for fast repository searches.
- Inspect edited Markdown in GitHub or a Markdown preview.
- Produce new transcript payloads directly as TXT through the TypeScript pipeline; do not hand-edit or route them through new JSON.
- Treat `docs/questions/*.md` as the only authoritative Markdown source for episode question pages.
- Treat every generated `site/content/questions/*.md` front-matter stub except `_index.md` as build output from `npm run build:site-content`; do not hand-edit or stage those stubs.
- Investigate ignore, tracking, or generator policy drift before committing if generation makes Git report changes under `site/content/questions/`.

Runner availability notes for Codex desktop sessions:

Before reporting an expected tool as unavailable:

- Treat a failed lookup inside the restricted Codex command runner as inconclusive.
- Try the configured explicit path or bundled runtime.
- Retry the lookup and any required command with sandbox escalation when the executable may be outside the sandbox's readable roots.
- Report the tool as unavailable only after the outside-sandbox check also fails.

- CodeGraph: this repository is indexed and the CodeGraph MCP is available to Codex desktop sessions. Use `mcp__codegraph__codegraph_explore` before raw code searches or file-by-file navigation. The restricted command runner may fail to resolve the `codegraph` shell executable; that PATH failure does not mean CodeGraph is unavailable. Discover and use the MCP tool instead.
- Python: do not assume `python` is on `PATH`. Prefer `C:\Toolbox\Python313\python.exe`, which includes PyYAML. If that installation is unavailable, use the Python executable reported by `codex_app.load_workspace_dependencies`.
- Node and package runners: `node`, `npm`, and `pnpm` may be available directly, but if PATH lookup fails, use the Node.js or pnpm executable reported by `codex_app.load_workspace_dependencies`. If an npm wrapper fails while Node works, prefer direct checks such as `node --check` or `node --test` when they cover the same surface.
- Hugo: Hugo Extended is installed for the user and is normally exposed through `C:\Users\JR\AppData\Local\Microsoft\WinGet\Links\hugo.exe`. The sandbox may be unable to resolve or execute that WinGet link even when it is present on `PATH` and `hugo version` works in the interactive terminal. A sandboxed miss requires the outside-sandbox retry described above. Use `npm run check:site` for the complete fresh Hugo build and validation. Fall back to `npm run check:site:static` only if the escalated Hugo check also fails; allow a longer timeout because validation can take 45 seconds or more.

### Available Node Development Tooling

The installed development packages support new validation, triage, and diagnostic scripts. The project requires Node 22.19 or newer because `lighthouse` requires Node 22.19 and `puppeteer-core` requires Node 22.12. TypeScript sources compile as CommonJS under `NodeNext`; the enforced Node floor supports the current ESM-first packages used by these tools.

- Markdown and metadata: use `parseQuestionTableText` as the contract parser for authoritative `docs/questions` Q&A rows. Use `markdown-it` for wider Markdown tokenization and its token `map` values for line-aware diagnostics. Use `gray-matter` to read or validate front matter in repository-owned Markdown, especially generated Hugo stubs; `docs/questions/*.md` remains the front-matter-free source of record. Use `htmlparser2.parseDocument` plus `DomUtils` for rendered HTML structure, attributes, text, and entity decoding. For XML, enable `xmlMode` and retain explicit namespace and validity checks because the parser repairs some malformed markup.
- Similarity and wording triage: use `dice-coefficient` for symmetric whole-string similarity and `fast-fuzzy` for typo-tolerant query-to-corpus ranking. Normalize text and choose explicit thresholds. `fast-fuzzy` enables Sellers substring matching by default, so pass `{useSellers: false}` for whole-string duplicate checks. Similarity scores surface candidates; transcript evidence and semantic review decide edits. A mechanical-wording scanner should begin with deterministic phrase rules over parsed Q&A cells, then use similarity only to find variants.
- Repository traversal: use `ignore` when a script walks broad directory trees and must honor `.gitignore`. Load the ignore file explicitly and pass repository-relative paths; the package filters paths and does not perform traversal itself.
- Browser and site diagnostics: use `puppeteer-core` for headless interaction checks, screenshots, and client-side search smoke tests. It downloads no browser, so provide an installed Chrome or Edge `executablePath`, keep launches headless, and close the browser in `finally`. Use `lighthouse` against a served Hugo build for supplementary accessibility, SEO, best-practices, and performance reports. Set `CHROME_PATH` when browser discovery is unreliable and write reports under `reports/`. Lighthouse scores vary between runs; the deterministic `check:site` and `check:site:rendered` checks remain the release gates.
- Process and environment diagnostics: use `ps-list` for lightweight process enumeration and `systeminformation` for targeted asynchronous OS, CPU, memory, network, or process facts. On Windows, `ps-list` omits command line, CPU, memory, executable path, and start time. Keep both tools diagnostic and report-oriented because fields and availability vary by operating system; prefer scoped `systeminformation` calls over its slower full-system collection.

## Coding Style & Naming Conventions

Use Markdown for human-facing reference pages. Keep headings clear, tables compact, and summaries factual. Prefer ASCII punctuation unless preserving names or quoted source text requires otherwise.

Follow existing transcript naming patterns:

```text
208-hysterical-context-error.txt
208-super-chat-questions.md
```

Curated page conventions:

- Use `docs/questions/<slug>-questions.md` for ordinary curated pages.
- Use `docs/questions/<slug>.md` when the slug already ends in `questions`, avoiding names such as `questions-questions.md`.
- Use special-purpose pages such as `208-super-chat-questions.md` only when explicitly requested.
- Use the four-column table `Time | Question | Short answer / answer direction | Expanded answer` for ordinary Q&A pages.
- Treat filled expanded answers as the current baseline rather than a pending migration.

The TypeScript site-content builder generates each episode's SEO description from representative curated questions. Review that description when adding or substantially revising an episode. If the generated result is weak or unrepresentative, add one transcript-grounded, single-line override near the top of the authoritative `docs/questions/*.md` page:

```html
<!-- seo-description: Concise, accurate description of this episode's questions. -->
```

Do not add multiple overrides or edit the generated `site/content/questions/*.md` mirror.

Timestamp links should point directly to YouTube with `?t=`. For links intended to open in a new GitHub tab, use:

```html
<a href="https://youtu.be/VIDEO_ID?t=123" target="_blank" rel="noopener noreferrer">2:03</a>
```

## Testing Guidelines

- `npm run check`: run the canonical network-free repository validation pipeline.
- `npm run check:quick`: run TypeScript checks, including unused-code enforcement, and JavaScript syntax checks.
- `npm run check:ci`: run validation when generated output and the tracked worktree must also remain clean.
- `npm test`: run the JavaScript search suite and compiled TypeScript tests.
- `npm run check:js`: run after changing JavaScript or the search-index builder.
- `npm run check:transcript-store`: run for acquisition changes; it validates canonical archive state and detects inventory and transcript transactions.
- `npm run check:site:static`: run for source-to-site compatibility validation; it generates the ignored question stubs before checking them.
- `npm run check:site:rendered -- --public-dir site/public --expected-base-url URL`: run after a production-baseURL Hugo render to check complete rendered metadata, indexability, JSON-LD parsing, sitemap coverage, and internal links.
- Curated Q&A pages: compare short and expanded answers against the manifest-owned TXT transcript.

## Commit & Pull Request Guidelines

Recent commits use short, descriptive messages, for example `1-100 transcripts` and `fix md file ordering`. Continue that style: concise, lower-friction summaries focused on the changed content.

Pull requests should explain the affected episode range or file set, note whether changes are raw transcript imports or curated Markdown edits, and mention any manual validation performed. For curated pages, include enough context for reviewers to verify the timestamp and summary against the transcript.

## User Communication

Lead with the outcome. Keep all required facts, decisions, evidence, caveats, blockers, and next actions; trim introductions, repetition, generic reassurance, and optional background first.

For completed change tasks, use this compact closeout shape when it fits:

- Changed:
- Files:
- Checked:
- Notes:

For reviews, diagnoses, and audit-only requests, lead with prioritized findings instead of forcing empty change fields. Do not include tutorials, broad background, or repeated restatements unless requested.

## Agent-Specific Instructions

Transcript curation rules:

- Do not invent transcript content.
- Preserve uncertainty when audio or transcript text is unclear.
- Include all real questions supported by the transcript, including questions beyond super chats.
- Keep curated pages useful as navigation aids with a question, timestamp, direct video link, short answer direction, and transcript-grounded expanded answer when supported by the source.

### Agent Routing

Search-routing rules:

- Use `$search-index-curator` for Hugo site search, search indexing, missing or noisy results, aliases, query smoke tests, or making a term easier to find, even when the user does not name the skill exactly.
- Treat natural phrasing such as "fix search for X", "improve results for X", "search misses X", "X should find Y", or "add a synonym/alias" as sufficient routing evidence.

When a curated page needs transcript inspection, resolve the matching `src/transcripts/txt/<fileStem>.txt` through `src/transcripts/manifest.json`. TXT is the source of record and is optimized for `rg`, `Select-String`, and bounded `Get-Content` review.

When requesting `transcript-question-page-audit`, prefer project-root-relative paths and the direct phrase:

```text
docs/questions/<file>.md use $transcript-question-page-audit find and fix issues with complete transcript-grounded validation; report material changes, checks, blockers, and uncertainty
```

Add `with full transcript coverage` when the goal includes finding missing questions.

If a registered expected TXT file is missing, report the store inconsistency and use the safe all-eligible TypeScript acquisition path:

```powershell
npm run fetch:transcripts -- --dry-run
npm run fetch:transcripts
```

If captions are unavailable or the fetcher reports no transcript segments, do not create a fabricated curated page.

### AI Model Changes

When changing transcript-processing prompts or workflows:

- Compare representative first-pass creation and full-audit tasks.
- Compare question recall, transcript support, timestamp accuracy, row counts, validation results, and material uncertainty before adopting the change.
- Keep `src/transcript-audit.log` records focused on coverage, row counts, validation, and substantive changes.

### Notes Placement and Configuration

Placement rules:

- Use `./task-notes/` for transient in-project task notes, including AI session summaries and temporary human task documentation; create the directory when needed.
- Store canonical transcript TXT files under `src/transcripts/txt/`.
- Store generated reports, validation output, smoke-test output, CSV/JSON report data, and Markdown report files under `./reports/`.

`task-notes/README.md` is the committed policy file for this notes area.

AI session summary filenames must use this format:

```text
yyyy-MM-dd_THH-mm-ss<UTC-offset>_<summary-name>.md
```

Use an ASCII, lowercase, hyphenated `<summary-name>` with no spaces. Use local time and include the UTC offset without a colon in the filename.

Example:

```text
2026-06-14_T05-29-19-0500_episode-14-summary.md
```

Also include the full ISO 8601 timestamp in the file header, using colons in the time and UTC offset:

```text
Timestamp: 2026-06-14T05:29:19-05:00
```
