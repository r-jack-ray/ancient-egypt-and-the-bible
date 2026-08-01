# Repository Guidelines

## Project Structure & Module Organization

This repository is a Questions & Answers reference archive for the Ancient Egypt and the Bible livestreams, not an application. The main source data and public reference pages live under `src/` and `docs/`.

- `src/channel/episodes.json`: canonical archive membership, stable video IDs, titles, slugs, order, and `fileStem` values.
- `src/live-stream-list.md`: deterministic Hugo compatibility projection with YouTube links and transcript slugs.
- `src/transcripts/manifest.json`: canonical TXT payload facts and video-ID-to-file mapping.
- `src/transcripts/txt/`: canonical transcript payloads, one indexed/timestamped segment per line, and the default curation surface.
- `docs/questions/`: canonical curated GitHub-readable Q&A reference pages with timestamp links, short answers, and filled transcript-grounded expanded answers.
- `site/`: Hugo compatibility site. `site/content/questions/_index.md` is handwritten and tracked; the other question Markdown files are generated mirrors, ignored by Git, and must not be edited or committed.
- `tests/`: Node test coverage for the generated search index and client-side search behavior.
- `src/scripts/`: Node 22 + strict TypeScript inventory, transcript acquisition, reporting, site generation, and validation CLIs.
- `reports/`: ignored generated reports, validation output, smoke-test output, and triage artifacts.
- `task-notes/`: transient in-project notes, AI session summaries, and temporary human task documentation. Create this directory if it is missing.

There is no server application or conventional application module tree. The repository does have Node-based search tooling, automated search tests, and a Hugo build/deployment pipeline.

## Build, Test, and Development Commands

Transcript curation has no compile step. The Hugo/search surfaces do have build and validation commands:

```powershell
rg "search term" src/transcripts docs/questions
Get-Content docs/questions/208-super-chat-questions.md
npm run check:transcript-store
npm run check:stream-index
npm run fetch:video-links
npm run alternate:fetch:transcripts:safe -- --dry-run
npm run build:site-content
npm run check:question-tables
npm test
npm run check:js
npm run check:site:static
git -c safe.directory=C:/Workspaces/ancient-egypt-and-the-bible status --short
```

Use `rg` for fast repository searches. When editing Markdown, inspect the rendered structure manually in GitHub or a Markdown preview. New transcript payloads are produced directly as TXT by the TypeScript pipeline, not hand-edited or routed through new JSON.

Treat `docs/questions/*.md` as the only authoritative Markdown source for episode question pages. `npm run build:site-content` recreates every `site/content/questions/*.md` mirror except `_index.md`; do not hand-edit or stage those generated mirrors. If generation makes Git report changes under `site/content/questions/`, treat that as ignore, tracking, or generator policy drift and investigate before committing.

Runner availability notes for Codex desktop sessions:

A failed executable lookup inside the restricted Codex command runner is not proof that the tool is absent from the user's machine. Before reporting an expected tool as unavailable, try its configured explicit path or bundled runtime. If the executable may be outside the sandbox's readable roots, retry the lookup and any required command with sandbox escalation. Only report the tool unavailable after that outside-sandbox check also fails.

- Python: do not assume `python` is on `PATH`. Prefer `C:\Toolbox\Python313\python.exe`, which includes PyYAML. If that installation is unavailable, use the Python executable reported by `codex_app.load_workspace_dependencies`.
- Node and package runners: `node`, `npm`, and `pnpm` may be available directly, but if PATH lookup fails, use the Node.js or pnpm executable reported by `codex_app.load_workspace_dependencies`. If an npm wrapper fails while Node works, prefer direct checks such as `node --check` or `node --test` when they cover the same surface.
- Hugo: Hugo Extended is installed for the user and is normally exposed through `C:\Users\JR\AppData\Local\Microsoft\WinGet\Links\hugo.exe`. The sandbox may be unable to resolve or execute that WinGet link even when it is present on `PATH` and `hugo version` works in the interactive terminal. A sandboxed miss requires the outside-sandbox retry described above. Use `npm run check:site` for the complete fresh Hugo build and validation. Fall back to `npm run check:site:static` only if the escalated Hugo check also fails; allow a longer timeout because validation can take 45 seconds or more.

## Coding Style & Naming Conventions

Use Markdown for human-facing reference pages. Keep headings clear, tables compact, and summaries factual. Prefer ASCII punctuation unless preserving names or quoted source text requires otherwise.

Follow existing transcript naming patterns:

```text
208-hysterical-context-error.txt
208-super-chat-questions.md
```

For ordinary curated pages, use `docs/questions/<slug>-questions.md`. If the slug already ends in `questions`, use `docs/questions/<slug>.md` to avoid duplicated names like `questions-questions.md`. Special-purpose pages such as `208-super-chat-questions.md` should only be used when explicitly requested. Ordinary Q&A pages use the four-column table `Time | Question | Short answer / answer direction | Expanded answer`; treat filled expanded answers as the current baseline, not as a pending migration.

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

Run `npm test` for the legacy search suite and compiled TypeScript tests, and run `npm run check:js` when JavaScript or the search-index builder changes. Use `npm run check:transcript-store` and `npm run check:stream-index` for acquisition changes. Use `npm run check:site:static` for source-to-site compatibility validation; it generates the ignored question mirrors before checking them. After a production-baseURL Hugo render, use `npm run check:site:rendered -- --public-dir site/public --expected-base-url URL` to check complete rendered metadata, indexability, JSON-LD parsing, sitemap coverage, and internal links. For curated Q&A pages, compare short and expanded answers against the manifest-owned TXT transcript.

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

Do not invent transcript content. Preserve uncertainty when audio or transcript text is unclear. This project converts the Questions & Answers in general from Ancient Egypt and the Bible livestreams into a reference repository, so curated pages should include all real questions supported by the transcript, not only super chats. Keep curated pages useful as navigation aids: question, timestamp, direct video link, short answer direction, and transcript-grounded expanded answer when supported by the source.

### Agent Routing

When a request involves Hugo site search, search indexing, missing or noisy search results, search aliases, search query smoke tests, or making a term easier to find, use `$search-index-curator` even if the user does not name the skill exactly. Treat natural phrasing such as "fix search for X", "improve results for X", "search misses X", "X should find Y", or "add a synonym/alias" as enough to route through the skill.

When a curated page needs transcript inspection, resolve the matching `src/transcripts/txt/<fileStem>.txt` through `src/transcripts/manifest.json`. TXT is the source of record and is optimized for `rg`, `Select-String`, and bounded `Get-Content` review.

When requesting `transcript-question-page-audit`, prefer project-root-relative paths and the direct phrase:

```text
docs/questions/<file>.md use $transcript-question-page-audit find and fix issues with complete transcript-grounded validation; report material changes, checks, blockers, and uncertainty
```

Add `with full transcript coverage` when the goal includes finding missing questions.

If a registered expected TXT file is missing, report the store inconsistency and use the direct TypeScript acquisition path:

```powershell
npm run alternate:fetch:transcript -- --video-id VIDEO_ID
```

If captions are unavailable or the fetcher reports no transcript segments, do not create a fabricated curated page.

### AI Model Changes

When changing transcript-processing prompts or workflows, compare representative first-pass creation and full-audit tasks. Compare question recall, transcript support, timestamp accuracy, row counts, validation results, and material uncertainty before adopting the change. Keep `src/transcript-audit.log` records focused on coverage, row counts, validation, and substantive changes.

### Notes Placement and Configuration

Use `./task-notes/` for transient in-project task notes, including AI session summaries and temporary human task documentation. Create the directory if it does not exist. Do not place canonical transcript TXT files here; those belong under `src/transcripts/txt/`. Do not place generated reports, validation output, smoke-test output, CSV/JSON report data, or Markdown report files here; those belong under `./reports/`.

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
