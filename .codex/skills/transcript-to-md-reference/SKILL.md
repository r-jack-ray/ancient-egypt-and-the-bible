---
name: transcript-to-md-reference
description: Convert Ancient Egypt and the Bible livestream transcript exports and generated TXT working transcripts into curated GitHub Pages Q&A reference pages. Use when Codex needs to turn source files under src/transcripts into Markdown files under docs/questions with all real audience questions, short answer summaries, timestamps, and direct YouTube links like docs/questions/6-all-of-this-has-happened-before-questions.md.
---

# Transcript to MD Reference

## Overview

Create curated Markdown reference pages from livestream transcript files. The goal is not to reproduce the whole transcript. The goal is to make GitHub Pages readers able to:

- find real audience questions
- scan a short answer direction
- open the original video at the right timestamp

The public-facing Markdown output belongs under `docs/questions/`. Keep raw transcript source data under `src/`.

A master list of public livestream entries is in `src/live-stream-list.md`. Treat the list as stream-centric, not episode-only. It may include numbered Q&A livestreams, special streams, and other public `/streams` entries. Do not limit processing to numbered episodes unless the user explicitly asks for numbered episodes only.

## Source Files

Use `src/transcripts/json/*.json` as the source of record.

Use `src/transcripts/txt/*.txt` as the default working transcripts for fast inspection and Q&A curation. These TXT files are derived from the JSON files and should have the same base slug:

```text
src/transcripts/json/12-the-quorum-of-the-twelve.json
src/transcripts/txt/12-the-quorum-of-the-twelve.txt
```

The generated TXT corpus should normally cover all non-empty JSON transcript exports.

Use `src/live-stream-list.md` to confirm:

- stream identifier or episode number, when present
- stream title
- YouTube video URL
- slug / filename pattern

If the JSON source is missing for a stream listed in `src/live-stream-list.md`, report the missing transcript source and do not invent a curated page.

If the JSON source exists but the TXT file is missing, generate TXT before curating:

```powershell
pwsh -NoProfile -File scripts/Convert-TranscriptJson.ps1 src/transcripts/json/12-the-quorum-of-the-twelve.json
```

The converter writes to `src/transcripts/txt/` by default, overwrites generated output by default, and emits one line per transcript segment:

```text
[22] 3:58 okay um how prevalent were the gnostics in egypt
```

If the converter reports that no transcript segments were found, treat the JSON as an empty placeholder. Do not invent a curated page; note the blocker and move to the next requested stream only when the user asked for a batch such as "next two episodes" or "next two streams."

Known documented transcript blockers may exist, such as disabled-transcript placeholder JSON files. Confirm the current blockers from `README.md`, `AGENTS.md`, the JSON file contents, and converter output before reporting final status.

For structured processing, the same script can emit TSV under `src/transcripts/tsv/`:

```powershell
pwsh -NoProfile -File scripts/Convert-TranscriptJson.ps1 src/transcripts/json/12-the-quorum-of-the-twelve.json -Format Tsv
```

Use TSV when many exact `StartSeconds` values or generated links need to be audited.

If legacy curated Markdown exists under `src/md/`, `transcripts/livestreams/md/`, or other non-`docs/questions/` paths, treat it as old output. Do not add new public Q&A pages there.

## Output Location

Write curated Q&A Markdown pages under:

```text
docs/questions/
```

Use filenames like:

```text
docs/questions/<slug>-questions.md
```

Examples:

```text
docs/questions/6-all-of-this-has-happened-before-questions.md
docs/questions/208-super-chat-questions.md
```

If the slug already ends in `questions`, use `.md` instead of duplicating the word, as in:

```text
docs/questions/5-five-and-even-more-questions.md
```

Special-purpose pages may diverge from the slug when the page indexes a narrower topic. For example, `docs/questions/208-super-chat-questions.md` is sourced from `src/transcripts/json/208-hysterical-context-error.json` but indexes only super chats. Use special-purpose filenames only when explicitly requested.

When creating a special-purpose page, include a short note near the top that identifies the page as a subset index, such as super chats, a topic-only index, or another narrow slice. Ordinary full Q&A pages should use the source stream slug.

Do not write new public Q&A pages under:

```text
src/md/
transcripts/livestreams/md/
```

Those are legacy or incorrect output locations for this GitHub Pages layout.

## Batch Selection

When the user asks for the "next" episode pages in this repository, interpret that as the next missing ordinary curated Markdown pages in ascending episode order from the numbered entries in `src/live-stream-list.md`, skipping pages that already exist under `docs/questions/`.

Treat `README.md` and `AGENTS.md` backlog or status notes as hints only. Verify the actual next missing pages against the files on disk because status text can drift.

If a blocked placeholder is encountered, note it and continue only when the user's requested batch count can still be satisfied by later non-empty transcript sources. For example, if the user asks for "next two episodes" and the next candidate has an empty transcript placeholder, report that blocker and continue to the next transcript-bearing episode so the user still gets two processable pages when possible.

For non-numbered streams, preserve their order from `src/live-stream-list.md` unless the user specifies another ordering rule.

## Workflow

1. Identify the target stream, episode number if present, title, URL, and slug.
2. Use `src/live-stream-list.md` to confirm the stream title, YouTube video URL, and slug.
3. Confirm the matching JSON source exists under `src/transcripts/json/`.
4. If the JSON source is missing, report the blocker and stop processing that stream.
5. Confirm the matching TXT working transcript exists under `src/transcripts/txt/`.
6. If TXT is missing and JSON is non-empty, run `scripts/Convert-TranscriptJson.ps1` for the JSON file.
7. If conversion reports no transcript segments, treat the JSON as an empty placeholder and do not create a fabricated curated page.
8. Read the TXT transcript first.
9. Use `rg`, `Select-String`, or bounded `Get-Content` inspection around likely question markers such as `?`, `question`, `asks`, `super chat`, `what`, `why`, `how`, `where`, `when`, `who`, `does`, `did`, `is`, `are`, `can`, `could`, and `would`.
10. Use the JSON only when raw transcript fields are needed beyond the TXT file.
11. Use TSV when exact `StartSeconds` values or generated links need to be audited.
12. Find real audience question starts, including super chats, regular chat questions, and questions read from any backlog.
13. Never limit a full Q&A page to super chats only unless the requested page is explicitly a super-chat-only index.
14. Expand each question across adjacent transcript rows until the question is complete.
15. Use the question start, not the answer start, for the timestamp.
16. Add a short answer / answer direction only when the transcript clearly supports it.
17. Write the output under `docs/questions/`.
18. Validate that table rows render cleanly and timestamp links point to the right YouTube time.
19. Update navigation and status references, especially `README.md`, when adding or moving public curated pages.

## Existing Page Safety

Curated pages under `docs/questions/` may contain human-edited summaries. Do not bulk overwrite an existing curated page unless the user explicitly asks to regenerate or replace it.

When improving an existing page:

- preserve useful manual curation
- make focused edits where possible
- compare changed answer summaries against the transcript
- avoid replacing a carefully curated page with raw generated output

## Output Format

Use this structure for ordinary curated Q&A pages:

```markdown
# Questions in Livestream 6

Live Stream #6: All of This Has Happened Before...

Time links open the YouTube video at the relevant timestamp.

| Time | Question | Short answer / answer direction |
|---:|---|---|
| <a href="https://youtu.be/VIDEO_ID?t=136" target="_blank" rel="noopener noreferrer">2:16</a> | Did the Sea Peoples' attacks on Egypt under Merneptah and Ramesses III contribute to the end of the New Kingdom? | Yes, especially under Ramesses III, but the decline was a longer economic and political process. |
```

For topic indexes or special-purpose pages, adapt the heading and table columns, but keep timestamp links in the first column unless the user asks for a different structure.

## Link Rules

Markdown links cannot force new tabs on GitHub. For GitHub-friendly timestamp links intended to open in a new tab, use HTML anchors with both `target="_blank"` and `rel="noopener noreferrer"`:

```html
<a href="https://youtu.be/VIDEO_ID?t=123" target="_blank" rel="noopener noreferrer">2:03</a>
```

Keep the timestamp display human-readable:

```text
9:03
1:22:43
```

Keep the `?t=` value in seconds. When the TXT transcript line has only the display timestamp, convert it to seconds for the URL.

If using TSV output, use the `StartSeconds` and `Link` columns directly.

## Table Rules

Markdown table rows must render cleanly in GitHub and GitHub Pages.

- Keep timestamp links in the first column.
- Escape literal pipe characters inside cells as `\|`.
- Avoid raw newlines inside table cells.
- Keep answer summaries short enough to scan.
- Verify each table row has the same number of unescaped pipe separators.
- Prefer a Markdown preview when a table contains HTML anchors, names with punctuation, or long question text.

## Curation Rules

- Do not invent transcript content or answer summaries.
- Preserve uncertainty when the transcript is unclear.
- Include all real questions supported by the transcript, not only super chats.
- Clean obvious transcript artifacts only when the intended wording is clear.
- Combine split transcript rows into one readable question, but do not over-normalize unclear wording.
- Prefer concise summaries over long paraphrases.
- Omit non-question setup, housekeeping, and closing thanks unless the page is explicitly meant to index them.
- Exclude repeated "thank you for the super chat" fragments unless they introduce the actual question.
- Keep table cells short enough to scan on GitHub Pages and GitHub source view.
- Preserve useful named entities, Bible references, Egyptian names, book titles, and chronology markers.
- Preserve the difference between what the question asks and what the answer actually supports.

## Navigation Expectations

Pages under `docs/questions/` are public-facing GitHub Pages content.

When adding new curated pages, update `README.md` if it is maintaining an explicit episode-link list or current-status summary. Compare `docs/questions/*.md` against the README curated episode list before finishing, and fix drift when the README claims a range or page count that no longer matches the files.

`docs/index.html` is the GitHub Pages search page. It should search the public reference content under `docs/questions/`. If it still contains copied template text or searches an unrelated path such as `/src/main/resources/sql`, update it or report the mismatch as part of the task.

For a large number of pages, prefer a grouped Markdown index under `docs/questions/`, leaving the existing `docs/index.html` search page intact unless the search UI itself needs to change:

```text
docs/questions/index.md
docs/questions/1-the-debug-episode-questions.md
docs/questions/2-bugs-bugs-and-fixes-questions.md
```

If migrating old generated pages, move them from `src/md/` or `transcripts/livestreams/md/` to `docs/questions/` and update any README, index, or search-page references that still point at old locations.

## Validation

After editing, run quick local checks:

```powershell
Select-String -Path docs/questions/FILE.md -Pattern 'target="_blank" rel="noopener noreferrer"'
rg -n "\[Watch on YouTube\]|\[PLACEHOLDER\]" docs/questions/FILE.md
rg -n "transcripts/livestreams/md|src/md" docs README.md
```

For tables, verify each row has the same number of unescaped pipe separators or inspect in a Markdown preview.

If a TXT file was generated for the stream, verify it exists under `src/transcripts/txt/` and that its line count matches the transcript segment count reported by the converter.

If a new curated page was added, ensure `README.md` links to the new page when the surrounding README section is listing curated episodes or curated pages.

## Done Checklist

A task using this skill is complete only when the relevant items are true:

- output is under `docs/questions/`
- no new public Q&A output was written under `src/md/` or `transcripts/livestreams/md/`
- timestamp links use `?t=` seconds
- timestamp display text is human-readable
- timestamp links that use `target="_blank"` also include `rel="noopener noreferrer"`
- questions are supported by transcript text
- answer summaries are supported by transcript text or clearly preserve uncertainty
- Markdown tables render cleanly
- existing curated pages were not bulk-overwritten without explicit user direction
- `README.md` explicit episode links and current-status text are updated when needed
- `docs/index.html` searches `docs/questions/` or the mismatch is reported
- generated TXT/TSV files, when created, were produced by `scripts/Convert-TranscriptJson.ps1`
