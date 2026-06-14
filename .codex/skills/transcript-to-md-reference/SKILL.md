---

name: transcript-to-md-reference
description: Convert Ancient Egypt and the Bible livestream transcript exports into curated GitHub Pages Q&A reference pages. Use when Codex needs to turn transcript JSON/source files into Markdown files under docs/questions with all real audience questions, short answer summaries, timestamps, and direct YouTube links like docs/questions/6-all-of-this-has-happened-before-questions.md.
---

# Transcript to MD Reference

## Overview

Create curated Markdown reference pages from livestream transcript files.

The goal is not to reproduce the whole transcript. The goal is to make GitHub Pages readers able to:

* find real audience questions
* scan a short answer direction
* open the original video at the right timestamp

The public-facing Markdown output belongs under `docs/questions/`.

Keep raw transcript source data under `src/`.

## Source Files

Use `src/transcripts/json/*.json` as the primary transcript source files.

Use `src/transcripts/txt/*.txt` as generated working transcripts for fast inspection. These TXT files are derived from the JSON files and should have the same base slug:

```text
src/transcripts/json/12-the-quorum-of-the-twelve.json
src/transcripts/txt/12-the-quorum-of-the-twelve.txt
```

If the TXT file does not exist for a target JSON file, generate it before curating:

```powershell
pwsh -NoProfile -File scripts/Convert-TranscriptJson.ps1 src/transcripts/json/12-the-quorum-of-the-twelve.json
```

The converter writes to `src/transcripts/txt/` by default, overwrites generated output by default, and emits one line per transcript segment:

```text
[22] 3:58    okay um how prevalent were the gnostics in egypt
```

For structured processing, the same script can emit TSV under `src/transcripts/tsv/`:

```powershell
pwsh -NoProfile -File scripts/Convert-TranscriptJson.ps1 src/transcripts/json/12-the-quorum-of-the-twelve.json -Format Tsv
```

Use `src/live-stream-list.md` to confirm:

* episode number
* episode title
* YouTube video URL
* slug / filename pattern

If legacy curated Markdown exists under `src/md/`, `transcripts/livestreams/md/`, or other non-`docs/questions/` paths, treat it as old output. New or regenerated curated Q&A pages should be written under `docs/questions/`.

## Output Location

Write curated Q&A Markdown pages under:

```text
docs/questions/
```

Use filenames like:

```text
<slug>-questions.md
```

Examples:

```text
docs/questions/6-all-of-this-has-happened-before-questions.md
docs/questions/208-super-chat-questions.md
```

Special-purpose pages may diverge from the slug when the page indexes a narrower topic (for example, `docs/questions/208-super-chat-questions.md` is sourced from `src/transcripts/json/208-hysterical-context-error.json` but indexes only super chats). Use this only when explicitly requested.
Do not write new public Q&A pages under:

```text
src/md/
transcripts/livestreams/md/
```

Those are legacy or incorrect output locations for this GitHub Pages layout.

## Workflow

1. Identify the target episode number and slug.
2. Confirm the matching JSON source exists under `src/transcripts/json/`.
3. Confirm the matching TXT working transcript exists under `src/transcripts/txt/`; if not, run `scripts/Convert-TranscriptJson.ps1` for the JSON file.
4. Use `src/live-stream-list.md` to confirm the episode title and YouTube video URL.
5. Read the TXT transcript around likely question starts using `rg`, `Select-String`, or bounded `Get-Content` inspection. Use the JSON only when you need raw transcript fields not present in the TXT file.
6. Find real audience question starts, including:

   * super chats
   * regular chat questions
   * questions read from any backlog
7. Never limit the page to super chats only unless the requested page is explicitly a super-chat-only index.
8. Expand each question across adjacent transcript rows until the question is complete.
9. Add a short answer / answer direction only when the transcript clearly supports it.
10. Write the output under `docs/questions/`.
11. Validate that table rows render cleanly and timestamp links point to the right YouTube time.

## Output Format

Use this structure for curated Q&A pages:

```markdown
# Questions in Livestream 6

Live Stream #6: All of This has Happened Before...

Time links open the YouTube video at the relevant timestamp.

| Time | Question | Short answer / answer direction |
|---:|---|---|
| <a href="https://youtu.be/VIDEO_ID?t=136" target="_blank" rel="noopener noreferrer">2:16</a> | Did the Sea Peoples' attacks on Egypt under Merneptah and Ramesses III contribute to the end of the New Kingdom? | Yes, especially under Ramesses III, but the decline was a longer economic and political process. |
```

For other topic indexes, adapt the table columns, but keep timestamp links in the first column.

## Link Rules

Markdown links cannot force new tabs on GitHub.

Use HTML anchors for timestamp links:

```html
<a href="https://youtu.be/VIDEO_ID?t=123" target="_blank" rel="noopener noreferrer">2:03</a>
```

Keep the timestamp display human-readable:

```text
9:03
1:22:43
```

Keep the `?t=` value in seconds.

When the transcript TXT line has only the display timestamp, convert it to seconds for the URL. If using TSV output, use the `StartSeconds` and `Link` columns directly.

## Curation Rules

* Do not invent transcript content or answer summaries.
* Preserve uncertainty when the transcript is unclear.
* Include all real questions supported by the transcript, not only super chats.
* Clean obvious transcript artifacts only when the intended wording is clear.
* Prefer concise summaries over long paraphrases.
* Omit non-question setup, housekeeping, and closing thanks unless the page is explicitly meant to index them.
* Exclude repeated "thank you for the super chat" fragments unless they introduce the actual question.
* Keep table cells short enough to scan on GitHub Pages and GitHub source view.
* Preserve useful named entities, Bible references, Egyptian names, book titles, and chronology markers.

## Navigation Expectations

Pages under `docs/questions/` are public-facing GitHub Pages content.

When adding new pages, also consider whether `docs/index.md` or `docs/index.html` needs a link to the new question page.

For a large number of pages, prefer a grouped index such as:

```text
docs/index.md
docs/questions/index.md
docs/questions/1-the-debug-episode-questions.md
docs/questions/2-bugs-bugs-and-fixes-questions.md
```

## Validation

After editing, run quick local checks:

```powershell
Select-String -Path docs/questions/FILE.md -Pattern 'target="_blank"'

rg -n "\[Watch on YouTube\]|\[PLACEHOLDER\]" docs/questions/FILE.md

rg -n "transcripts/livestreams/md|src/md" docs README.md
```

For tables, verify each row has the same number of pipe characters or inspect in a Markdown preview.

Ensure the README file links to the new page, in the section with the other episode links.

If a TXT file was generated for the episode, verify it exists under `src/transcripts/txt/` and that its line count matches the transcript segment count reported by the converter.

If migrating old generated pages, move them from `src/md/` to `docs/questions/` and update any README, index, or search-page references that still point at `src/md/`.
