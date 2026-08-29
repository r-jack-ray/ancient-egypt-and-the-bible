# Ancient Egypt and the Bible Transcript Reference

> Live site: [r-jack-ray.github.io/ancient-egypt-and-the-bible](https://r-jack-ray.github.io/ancient-egypt-and-the-bible/)

This repository turns the *Ancient Egypt and the Bible* livestream archive into a searchable, transcript-grounded reference. It combines canonical timestamped transcripts with curated question-and-answer pages so readers can find a topic, inspect a concise answer, and jump to the relevant moment in the original video.

The curated pages are navigation aids. Verify quotations, context, and ambiguous captions against the [original YouTube channel](https://www.youtube.com/@ancientegyptandthebible) and video.

## Explore the Archive

| Destination | Purpose |
|---|---|
| [Curated Markdown](./docs/questions/) | Read the authoritative human-edited Q&A pages directly on GitHub. |
| [Canonical TXT transcripts](./src/transcripts/txt/) | Search the complete stored transcript corpus. |
| [Episode inventory](./src/channel/episodes.json) | Inspect canonical stream membership, titles, video IDs, slugs, and transcript policy. |
| [Hugo site source](./site/) | Inspect the content, layouts, assets, data, and search surfaces used for deployment. |

Timestamp links on Q&A pages open the matching YouTube video at the question start.

## Current Archive Snapshot

Inventory counts observed on 2026-08-29:

| Surface | Coverage |
|---|---:|
| Registered streams | 290: 276 numbered and 14 special or side-series streams |
| Canonical TXT transcripts | 288: 274 numbered and all 14 non-numbered streams |
| Curated Q&A pages | 288: 274 numbered and all 14 non-numbered streams |
| Known-unavailable transcripts | 2 numbered streams |

The two canonical `known-unavailable` records are:

- Live Stream #118: *Yeah, Even with Good Questions, the Egyptian Afterlife Still Sucks*
- Live Stream #162: *King for a Day*

Run `npm run status:transcripts` for the current stored, known-unavailable, pending, and recorded-failure totals.

## Content and Data Flow

The repository has distinct authoritative and generated surfaces:

```text
YouTube Data API
  -> src/channel/episodes.json + src/channel/video-metadata.json
  -> npm run fetch:transcripts
  -> src/transcripts/manifest.json + src/transcripts/txt/
  -> transcript-grounded curation and audit
  -> docs/questions/ + src/transcript-audit.log
  -> npm run build:site-content
  -> Hugo question stubs + site data + prebuilt search data
  -> Hugo render
  -> site/public/ and the GitHub Pages artifact
```

| Path | Role and edit policy |
|---|---|
| [`src/channel/episodes.json`](./src/channel/episodes.json) | Sole canonical archive inventory and stable identity mapping. |
| [`src/channel/video-metadata.json`](./src/channel/video-metadata.json) | Canonical normalized YouTube metadata and readiness state. |
| [`src/transcripts/manifest.json`](./src/transcripts/manifest.json) | Canonical video-to-TXT mapping, provenance, hashes, byte lengths, and line counts. |
| [`src/transcripts/fetch-status.json`](./src/transcripts/fetch-status.json) | Resumable transcript-acquisition failure state. |
| [`src/transcripts/txt/`](./src/transcripts/txt/) | Canonical transcript payloads and the source of record for curation. |
| [`docs/questions/`](./docs/questions/) | Canonical human-edited Q&A pages. Hugo publishes generated counterparts to GitHub Pages. |
| [`src/transcript-audit.log`](./src/transcript-audit.log) | Append-only creation and audit history. It records work completed rather than transcript evidence. |
| [`site/data/search-aliases.json`](./site/data/search-aliases.json) | Curated search spelling, transliteration, abbreviation, and phrase aliases. |
| [`site/data/episodes.json`](./site/data/episodes.json), [`site/data/questions.json`](./site/data/questions.json) | Tracked generated site data. Regenerate and commit these files with source changes. |
| [`site/static/search/`](./site/static/search/) | Tracked generated MiniSearch documents, index, and manifest. Regenerate and commit them with source changes. |
| [`site/content/questions/*.md`](./site/content/questions/) | Ignored generated front-matter stubs, except the handwritten tracked `_index.md`. |
| `site/public/`, `dist/`, `reports/` | Ignored local build or diagnostic output. |

Each canonical TXT line contains a segment index, display timestamp, a tab, and normalized transcript text. Raw transcript JSON and TSV are outside the tracked transcript store.

Ordinary Q&A pages use the filled four-column contract:

```text
Time | Question | Short answer / answer direction | Expanded answer
```

Both answer fields are grounded in the manifest-owned TXT transcript. The expanded answer preserves the supported reasoning, examples, qualifications, and uncertainty needed to understand the response.

## Repository Layout

```text
.agents/skills/              Repository-specific Codex curation and search workflows
.github/workflows/           Linux/Windows validation and GitHub Pages deployment
docs/questions/              Canonical curated Markdown Q&A pages
project-notes/               Durable project and GitHub handling notes
reports/                     Ignored generated diagnostics and review artifacts
scripts/                     JavaScript search-index builder
site/
  assets/                    Hugo-managed CSS and browser JavaScript
  content/                   Handwritten section indexes and generated question stubs
  data/                      Generated episode/question data and curated search aliases
  layouts/                   Hugo templates
  static/search/             Generated prebuilt search artifacts
  hugo.yaml                  Hugo configuration
src/
  channel/                   Canonical archive inventory and YouTube metadata
  pipeline/                  Atomic-file and lease helpers
  questions/                 Markdown table parsing and validation
  scripts/                   TypeScript command-line entry points
  site/                      Site generation and validation
  transcripts/              Manifest, fetch state, and canonical TXT payloads
  youtube/                   Inventory, metadata, and transcript acquisition
  transcript-audit.log       Append-only curation and audit history
task-notes/                  Transient project notes and retained decision history
tests/                       Browser-search tests; TypeScript tests are colocated under src/
```

Useful project guidance:

- [Repository contributor and agent guidance](./AGENTS.md)
- [First-pass transcript curation skill](./.agents/skills/transcript-to-md-reference/SKILL.md)
- [Existing-page transcript audit skill](./.agents/skills/transcript-question-page-audit/SKILL.md)
- [Search-index curation skill](./.agents/skills/search-index-curator/SKILL.md)
- [GitHub Pages and Actions handling](./project-notes/github-handling/README.md)
- [Task-note policy](./task-notes/README.md)

## Local Setup and Validation

Node.js 22.19 or newer is required. Install the pinned dependencies before using the repository tooling:

```powershell
npm ci
```

The canonical network-free validation command is:

```powershell
npm run check
```

`npm run check` compiles and tests the TypeScript tools, validates the canonical transcript store, checks JavaScript, regenerates and validates static Hugo/search content, and runs the search tests. Because it reaches `check:site:static`, a separate `build:site-content` run is unnecessary in the normal final validation sequence.

### Command Reference

| Command | Purpose |
|---|---|
| `npm run check:quick` | Type-check with unused-code enforcement and check JavaScript syntax. |
| `npm test` | Run browser-search tests and compiled TypeScript tests. |
| `npm run check` | Run the canonical network-free repository validation pipeline. |
| `npm run check:ci` | Run the canonical validation pipeline, whitespace gate, and tracked generated-output/worktree cleanliness check. Use it on a clean committed checkout or in CI. |
| `npm run check:transcript-store` | Validate inventory, metadata, manifest, fetch state, TXT payloads, and transaction state. |
| `npm run status:transcripts` | Print transcript coverage and acquisition status without writing a report. |
| `npm run check:question-tables` | Validate all Q&A tables and filled expanded answers. |
| `npm run check:question-tables -- --path docs/questions/<page>.md` | Validate one curated page. |
| `npm run check:question-wording` | Report actionable high-confidence mechanical wording issues in parsed Q&A cells. |
| `npm run check:question-wording -- --path docs/questions/<page>.md` | Scan one curated page; add `--review` for judgment-required candidates, `--strict` to gate high-confidence issues, `--strict-review` to include review candidates in the gate, `--fuzzy` for typo-tolerant variants, or `--report` for ignored JSON and Markdown reports. |
| `npm run build:site-content` | Regenerate Hugo question stubs, tracked site data, and prebuilt search artifacts. |
| `npm run check:search-aliases` | Validate search aliases and their query expectations. |
| `npm run check:site:static` | Regenerate and validate site content and aliases without invoking Hugo. |
| `npm run check:site` | Regenerate content, validate aliases and static data, render with Hugo, and validate rendered metadata, indexability, JSON-LD, sitemap coverage, and internal links. |
| `npm run check:site:rendered -- --public-dir site/public --expected-base-url URL` | Validate an existing production-baseURL Hugo render. |
| `npm run serve:site` | Regenerate content and serve the site locally at the GitHub Pages subpath. |

### Hugo Preview

Hugo Extended is required for a full local render and preview. On Windows:

```powershell
winget install Hugo.Hugo.Extended
hugo version
npm run check:site
npm run serve:site
```

Open <http://127.0.0.1:1314/ancient-egypt-and-the-bible/> after the server starts. Use `npm run check:site:static` when only the Node-based compatibility checks are needed.

## Livestream Acquisition and Curation

### 1. Refresh the Canonical Inventory

The YouTube API key precedence is `--api-key-file`, `YOUTUBE_API_KEY`, then the ignored `.local/youtube-api-key.txt` fallback. Literal command-line keys are rejected.

Run the normal inventory refresh:

```powershell
npm run fetch:livestreams
```

By default, the command registers every proposed numbered livestream and every broadcast whose title begins `Special Live Stream`, pins the resolved channel source when needed, and atomically updates [`src/channel/episodes.json`](./src/channel/episodes.json) and [`src/channel/video-metadata.json`](./src/channel/video-metadata.json). Other broadcasts remain outside the canonical inventory.

Use a report-only review when needed:

```powershell
npm run fetch:livestreams -- --review-only
```

This writes the ignored YouTube channel inventory delta to `reports/stream-inventory-candidate.json` without canonical changes. Use `--accept-latest` or repeat `--accept-addition VIDEO_ID` for an explicit selection, and use `--output <path>` when a report is intentionally required from another run mode.

### 2. Acquire Missing Transcripts

Preview the eligible batch without network access or canonical writes, then fetch all ready missing transcripts:

```powershell
npm run fetch:transcripts -- --dry-run
npm run fetch:transcripts
```

The npm command spaces transcript attempts by 60 seconds. It skips valid stored transcripts, known-unavailable records, and streams that are not ready; writes successful payloads directly under [`src/transcripts/txt/`](./src/transcripts/txt/); updates the manifest and fetch state; and reports every stored, deferred, failed, or pending record. Valid stored TXT files remain unchanged. Recorded failures remain eligible on later runs.

Use `--limit 1` for a batch canary. Refresh incomplete or changing video metadata with:

```powershell
npm run refresh:livestream-metadata
npm run refresh:livestream-metadata -- --refresh-all
```

Validate the resulting state:

```powershell
npm run check:transcript-store
npm run status:transcripts
```

Reserve `npm run check:transcript-store -- --repair-transaction` for an unfinished inventory or transcript transaction journal.

### 3. Create the First-Pass Q&A Page

Resolve the stable `fileStem` through [`src/transcripts/manifest.json`](./src/transcripts/manifest.json), then use the [first-pass curation skill](./.agents/skills/transcript-to-md-reference/SKILL.md):

```text
src/transcripts/txt/<fileStem>.txt process with $transcript-to-md-reference
```

The creation pass inspects the complete transcript, records every supported audience question, writes the canonical page under [`docs/questions/`](./docs/questions/), validates it, and appends one creation record to [`src/transcript-audit.log`](./src/transcript-audit.log).

For new ordinary pages, use `docs/questions/<slug>-questions.md`. When the slug already ends in `questions`, use `docs/questions/<slug>.md`. Existing historical filenames remain stable; resolve existing pages from the actual directory and canonical stream identity.

### 4. Run One Independent Full Audit

After creation, use the [page-audit skill](./.agents/skills/transcript-question-page-audit/SKILL.md) once as a separate task:

```text
docs/questions/<page>.md use $transcript-question-page-audit find and fix issues with complete transcript-grounded validation, full transcript coverage, and final direct-answer wording cleanup; report material changes, checks, blockers, and uncertainty
```

Stop the normal semantic workflow when the audit records `coverage=full`, `could_use_further_inspection=no`, `expanded_answers_pending=0`, and validation passes. Run a follow-up only for an explicit trigger such as incomplete coverage, unresolved caption or timestamp uncertainty, a named wording issue, or a broad structural problem found by the audit.

### 5. Validate and Review the Complete Change

```powershell
npm run check:question-tables -- --path docs/questions/<page>.md
npm run check
git diff --check
git -c safe.directory=C:/Workspaces/ancient-egypt-and-the-bible status --short
git diff
```

Review and stage the relevant canonical inventory, metadata, TXT, manifest, fetch state, curated Markdown, audit log, and README changes. Include regenerated tracked [`site/data/episodes.json`](./site/data/episodes.json), [`site/data/questions.json`](./site/data/questions.json), and [`site/static/search/`](./site/static/search/) artifacts. The ignored question stubs under [`site/content/questions/`](./site/content/questions/) and local `site/public/` render stay out of the commit.

The steady-state weekly path is:

```text
refresh inventory
  -> acquire canonical TXT
  -> create first-pass Q&A page
  -> run one independent full audit
  -> run npm run check
  -> review canonical and tracked generated changes
  -> commit and push
```

## Q&A Curation Contract

For ordinary pages:

- Inspect the complete manifest-owned TXT transcript for creation and full-audit tasks.
- Include all real transcript-supported audience questions, including live chat, super chats, backlog questions, and questions read aloud by the host.
- Use direct, searchable question wording while preserving names, Bible references, technical terms, dates, and chronology markers.
- Point each timestamp to the question start and keep the display label equal to the `?t=` value in seconds.
- Fill both answer columns with transcript-grounded prose. Keep the short answer scannable and the expanded answer sufficiently developed for the source response.
- Preserve uncertainty and limits when the captions or answer are unclear.
- Keep outside facts out of the curated answer unless the project scope is explicitly changed.

Use this timestamp-link form:

```html
<a href="https://youtu.be/VIDEO_ID?t=123" target="_blank" rel="noopener noreferrer">2:03</a>
```

The site generator derives representative SEO descriptions from curated questions. Add a single transcript-grounded override near the top of a canonical page only when the generated description is weak:

```html
<!-- seo-description: Concise, accurate description of this episode's questions. -->
```

## Search Maintenance

Use the [search-index curation skill](./.agents/skills/search-index-curator/SKILL.md) for missing, noisy, misspelled, transliterated, or Bible-reference queries.

- Curate domain-specific aliases in [`site/data/search-aliases.json`](./site/data/search-aliases.json).
- Change [`site/assets/js/search-core.js`](./site/assets/js/search-core.js) for normalization, matching, ranking support, or highlighting behavior.
- Change [`site/assets/js/search.js`](./site/assets/js/search.js) or [`site/layouts/search/list.html`](./site/layouts/search/list.html) for browser orchestration or wiring.
- Change [`scripts/build-search-index.mjs`](./scripts/build-search-index.mjs) when index generation itself needs correction.
- Add query expectations or tests with every behavior change.

Typical validation is:

```powershell
npm run build:search-index
npm run check:search-aliases
npm test
npm run check:js
```

Run `npm run check:site:static` when layouts, generated compatibility content, or site wiring changes.

## Reports and Generated Output

| Artifact | Created by | Lifecycle |
|---|---|---|
| `reports/stream-inventory-candidate.json` | `fetch:livestreams -- --review-only`, or a run with `--output` | Ignored review artifact; replace or remove when the comparison is complete. |
| `reports/question-table-validation.json` and `.md` | A failing table check, or a passing check with `--report` | Ignored diagnostics; later emitted reports replace them. |
| `reports/question-wording-scan.json` and `.md` | `check:question-wording -- --review --report` | Ignored wording-triage reports with repair guidance; review candidates require transcript-grounded judgment, must not be bulk-rewritten, and are not a zero-count cleanup target. |
| [`site/data/episodes.json`](./site/data/episodes.json), [`site/data/questions.json`](./site/data/questions.json), [`site/static/search/`](./site/static/search/) | `build:site-content` and site checks | Tracked deterministic outputs; review and commit changes with their sources. |
| [`site/content/questions/*.md`](./site/content/questions/) except `_index.md` | `build:site-content` and site checks | Ignored generated stubs; regenerate locally and leave unstaged. |
| `site/public/` | Hugo | Ignored local render and deployment input. |

Put temporary structured diagnostics, validation output, smoke-test output, and triage artifacts under ignored `reports/`. Put transient human or AI notes under [`task-notes/`](./task-notes/) using the [documented naming policy](./task-notes/README.md).

## Canonical Store Recovery

The tracked canonical state consists of [`src/channel/episodes.json`](./src/channel/episodes.json), [`src/channel/video-metadata.json`](./src/channel/video-metadata.json), [`src/transcripts/manifest.json`](./src/transcripts/manifest.json), [`src/transcripts/fetch-status.json`](./src/transcripts/fetch-status.json), and [`src/transcripts/txt/`](./src/transcripts/txt/). A fresh clone already contains the store.

For accidental working-tree loss or corruption, first inspect `git status` and `git diff`. Restore every affected file owned by the same inventory or transcript transaction from one reviewed, known-good commit so identity, hashes, provenance, and status remain coherent. Use a fresh clone for broad repository loss. Then validate:

```powershell
npm ci
npm run check:transcript-store
npm run check
```

Use `--repair-transaction` only for an unfinished journal. Restore coherent canonical state before rerunning acquisition for reviewed work that was never committed.

## Continuous Integration and Deployment

The [validation workflow](./.github/workflows/validate.yml) runs `npm run check:ci` on Linux and Windows for pull requests and manual dispatches. The [Pages workflow](./.github/workflows/pages.yml) runs on pushes to `master` and manual dispatches; it validates the repository, installs Hugo Extended, renders the production site, runs `check:site:rendered`, and deploys the Pages artifact.

Repository Pages settings, environment policy, branch validation, and deployment troubleshooting are documented in [GitHub Handling Notes](./project-notes/github-handling/README.md).

## Scope

This project is a navigation and reference layer over public video transcripts. It helps viewers, students, and researchers locate a discussion and verify it in the original video and transcript.
