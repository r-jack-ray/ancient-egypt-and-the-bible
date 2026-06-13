# Repository Guidelines

## Project Structure & Module Organization

This repository is a transcript reference archive, not an application. The main content lives under `transcripts/livestreams/`.

- `live-stream-list.md` and `live-stream-list.txt`: episode indexes.
- `json/`: raw YouTube transcript data for reprocessing and auditing.
- `tsv/`: timestamped transcript exports with `Timestamp`, `Text`, and `Link` columns.
- `md/`: curated GitHub-readable reference pages, such as question lists with timestamp links.

There is currently no source-code module tree, test directory, or asset pipeline.

## Build, Test, and Development Commands

There is no build step. Use shell checks to validate content changes:

```powershell
rg "search term" transcripts/livestreams
Get-Content transcripts/livestreams/md/208-super-chat-questions.md
git -c safe.directory=C:/Workspaces/ancient-egypt-and-the-bible status --short
```

Use `rg` for fast repository searches. When editing TSV or Markdown, inspect the rendered structure manually in GitHub or a Markdown preview.

## Coding Style & Naming Conventions

Use Markdown for human-facing reference pages. Keep headings clear, tables compact, and summaries factual. Prefer ASCII punctuation unless preserving names or quoted source text requires otherwise.

Follow existing transcript naming patterns:

```text
208-hysterical-context-error.json
208-hysterical-context-error.tsv
208-super-chat-questions.md
```

Timestamp links should point directly to YouTube with `?t=`. For links intended to open in a new GitHub tab, use:

```html
<a href="https://youtu.be/VIDEO_ID?t=123" target="_blank" rel="noopener noreferrer">2:03</a>
```

## Testing Guidelines

No automated test framework is configured. Validate changes by checking that referenced files exist, Markdown tables have consistent columns, and timestamp links match transcript rows. For curated Q&A pages, compare summaries against the TSV or JSON source before committing.

## Commit & Pull Request Guidelines

Recent commits use short, descriptive messages, for example `1-100 transcripts` and `fix md file ordering`. Continue that style: concise, lower-friction summaries focused on the changed content.

Pull requests should explain the affected episode range or file set, note whether changes are raw transcript imports or curated Markdown edits, and mention any manual validation performed. For curated pages, include enough context for reviewers to verify the timestamp and summary against the transcript.

## Agent-Specific Instructions

Do not invent transcript content. Preserve uncertainty when audio or transcript text is unclear. Keep curated pages useful as navigation aids: question, timestamp, direct video link, and a short answer direction when supported by the source.
