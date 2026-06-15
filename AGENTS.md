# Repository Guidelines

## Project Structure & Module Organization

This repository is a Questions & Answers reference archive for the Ancient Egypt and the Bible livestreams, not an application. The main source data and public reference pages live under `src/` and `docs/`.

- `src/live-stream-list.md` and `src/live-stream-list.txt`: episode indexes with YouTube links and transcript slugs.
- `src/transcripts/json/`: raw YouTube transcript JSON exports. Treat these as the source of record.
- `src/transcripts/txt/`: generated working transcript text files, one transcript segment per line. These are the default inspection surface for curation and currently exist for all non-empty JSON transcript exports through episode 208.
- `src/transcripts/tsv/`: optional generated TSV files, created only when structured columns are useful.
- `docs/questions/`: curated GitHub-readable Q&A reference pages with timestamp links.
- `docs/index.html`: GitHub Pages search page.
- `scripts/Convert-TranscriptJson.ps1`: PowerShell 7 converter from transcript JSON to TXT or TSV.
- `task-notes/`: transient in-project notes and AI session summaries. Create this directory if it is missing.

There is no application source-code module tree, automated test directory, or asset pipeline.

## Build, Test, and Development Commands

There is no build step. Use shell checks to validate content changes:

```powershell
rg "search term" src/transcripts docs/questions
Get-Content docs/questions/208-super-chat-questions.md
pwsh -NoProfile -File scripts/Convert-TranscriptJson.ps1 src/transcripts/json/14-fourteen-pieces-of-osiris.json
git -c safe.directory=C:/Workspaces/ancient-egypt-and-the-bible status --short
```

Use `rg` for fast repository searches. When editing Markdown, inspect the rendered structure manually in GitHub or a Markdown preview. Generated TXT or TSV transcript files should normally be produced by `scripts/Convert-TranscriptJson.ps1`, not hand-edited.

## Coding Style & Naming Conventions

Use Markdown for human-facing reference pages. Keep headings clear, tables compact, and summaries factual. Prefer ASCII punctuation unless preserving names or quoted source text requires otherwise.

Follow existing transcript naming patterns:

```text
208-hysterical-context-error.json
208-hysterical-context-error.txt
208-super-chat-questions.md
```

For ordinary curated pages, use `docs/questions/<slug>-questions.md`. If the slug already ends in `questions`, use `docs/questions/<slug>.md` to avoid duplicated names like `questions-questions.md`. Special-purpose pages such as `208-super-chat-questions.md` should only be used when explicitly requested.

Timestamp links should point directly to YouTube with `?t=`. For links intended to open in a new GitHub tab, use:

```html
<a href="https://youtu.be/VIDEO_ID?t=123" target="_blank" rel="noopener noreferrer">2:03</a>
```

## Testing Guidelines

No automated test framework is configured. Validate changes by checking that referenced files exist, Markdown tables have consistent columns, and timestamp links match transcript rows. For curated Q&A pages, compare summaries against the TXT working transcript first, then use the JSON source or TSV output when raw fields, start seconds, or link reconstruction need auditing.

## Commit & Pull Request Guidelines

Recent commits use short, descriptive messages, for example `1-100 transcripts` and `fix md file ordering`. Continue that style: concise, lower-friction summaries focused on the changed content.

Pull requests should explain the affected episode range or file set, note whether changes are raw transcript imports or curated Markdown edits, and mention any manual validation performed. For curated pages, include enough context for reviewers to verify the timestamp and summary against the transcript.

## Agent-Specific Instructions

Do not invent transcript content. Preserve uncertainty when audio or transcript text is unclear. This project converts the Questions & Answers in general from Ancient Egypt and the Bible livestreams into a reference repository, so curated pages should include all real questions supported by the transcript, not only super chats. Keep curated pages useful as navigation aids: question, timestamp, direct video link, and a short answer direction when supported by the source.

When a curated page needs transcript inspection, prefer the matching `src/transcripts/txt/<slug>.txt` file. The generated TXT files are optimized for `rg`, `Select-String`, and bounded `Get-Content` review. Use the JSON source of record to resolve ambiguity, confirm raw fields, or regenerate derived outputs; use TSV only when structured `StartSeconds` and `Link` columns are useful.

If a matching TXT file does not exist and the JSON source is non-empty, generate it with:

```powershell
pwsh -NoProfile -File scripts/Convert-TranscriptJson.ps1 src/transcripts/json/<slug>.json
```

If the converter reports that no transcript segments were found, treat the JSON as an empty placeholder and do not create a fabricated curated page.

Backlog note: curated Markdown reference pages still need to be filled in for livestream episodes 14 through 207, with episodes 118 and 162 currently blocked by empty JSON placeholders. When the user asks for the "next two episodes" in this repository, interpret that as the next two missing episode Markdown pages in ascending episode order from that backlog that have transcript data; note blocked placeholder episodes if encountered. Once episodes 14 through 207 are complete or explicitly accounted for, remove this backlog note from `AGENTS.md`.

### Notes Placement and Configuration

Use `./task-notes/` for transient in-project task notes, including AI session summaries and temporary task documentation. Create the directory if it does not exist. Do not place generated transcript TXT/TSV files here; those belong under `src/transcripts/`.

`task-notes/README.md` is the committed policy file for this notes area. Individual note files are local transient artifacts and are ignored by git.

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
