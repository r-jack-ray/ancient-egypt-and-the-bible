---

name: transcript-to-md-reference
description: Convert Ancient Egypt and the Bible livestream transcript exports and generated TXT working transcripts into curated GitHub Pages Q&A reference pages. Use when Codex needs to turn source files under src/transcripts into Markdown files under docs/questions with all real audience questions, short answer summaries, timestamps, and direct YouTube links like docs/questions/6-all-of-this-has-happened-before-questions.md.
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

A master list of live streams is in `src/live-stream-list.md`.

## Source Files

Use `src/transcripts/json/*.json` as the source of record.

Use `src/transcripts/txt/*.txt` as the default working transcripts for fast inspection and Q&A curation. These TXT files are derived from the JSON files and should have the same base slug:

```text
src/transcripts/json/12-the-quorum-of-the-twelve.json
src/transcripts/txt/12-the-quorum-of-the-twelve.txt
```

If JSON is missing, report the blocker and stop for that stream.  
If JSON exists but TXT is missing, generate TXT.  
If conversion reports no transcript segments, treat it as an empty placeholder.

```powershell
pwsh -NoProfile -File scripts/Convert-TranscriptJson.ps1 src/transcripts/json/12-the-quorum-of-the-twelve.json
```

The converter writes to `src/transcripts/txt/` by default, overwrites generated output by default, and emits one line per transcript segment:

```text
[22] 3:58    okay um how prevalent were the gnostics in egypt
```

If the converter reports that no transcript segments were found, treat the JSON as an empty placeholder. Do not invent a curated page; note the blocker and move to the next requested episode only when the user asked for a batch such as "next two episodes."

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

If the slug already ends in `questions`, use `<slug>.md` instead of duplicating the word, as in `docs/questions/5-five-and-even-more-questions.md`.

Special-purpose pages may diverge from the slug when the page indexes a narrower topic (for example, `docs/questions/208-super-chat-questions.md` is sourced from `src/transcripts/json/208-hysterical-context-error.json` but indexes only super chats). Use this only when explicitly requested.
Do not write new public Q&A pages under:

```text
src/md/
transcripts/livestreams/md/
```

Those are legacy or incorrect output locations for this GitHub Pages layout.

## Workflow

1. Identify the target episode number and slug.
2. Use `src/live-stream-list.md` to confirm the episode title, YouTube video URL, and slug.
3. Confirm the matching JSON source exists under `src/transcripts/json/`.
4. Confirm the matching TXT working transcript exists under `src/transcripts/txt/`; if not, run `scripts/Convert-TranscriptJson.ps1` for the JSON file.
5. Read the TXT transcript first. Use `rg`, `Select-String`, or bounded `Get-Content` inspection around likely question markers such as `?`, `question`, `asks`, `super chat`, `what`, `why`, `how`, `where`, `when`, `who`, `does`, `did`, `is`, `are`, `can`, `could`, and `would`.
6. Use the JSON only when you need raw transcript fields not present in the TXT file. Use TSV when many exact `StartSeconds` values or generated links need to be audited.
7. Find real audience question starts, including:

   * super chats
   * regular chat questions
   * questions read from any backlog
8. Never limit the page to super chats only unless the requested page is explicitly a super-chat-only index.
9. Expand each question across adjacent transcript rows until the question is complete. Use the question start, not the answer start, for the timestamp.
10. Add a short answer / answer direction only when the transcript clearly supports it.
11. Write the output under `docs/questions/`.
12. Validate that table rows render cleanly and timestamp links point to the right YouTube time.

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
* Combine split transcript rows into one readable question, but do not over-normalize unclear wording.
* Prefer concise summaries over long paraphrases.
* Omit non-question setup, housekeeping, and closing thanks unless the page is explicitly meant to index them.
* Exclude repeated "thank you for the super chat" fragments unless they introduce the actual question.
* Keep table cells short enough to scan on GitHub Pages and GitHub source view.
* Preserve useful named entities, Bible references, Egyptian names, book titles, and chronology markers.

## Navigation Expectations

Pages under `docs/questions/` are public-facing GitHub Pages content.

When adding new pages, update `README.md` if it is maintaining an explicit episode-link list.

```text
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

If adding a new curated episode page, ensure the README file links to the new page when the surrounding README section is listing curated episodes.

If a TXT file was generated for the episode, verify it exists under `src/transcripts/txt/` and that its line count matches the transcript segment count reported by the converter.

If migrating old generated pages, move them from `src/md/` to `docs/questions/` and update any README, index, or search-page references that still point at `src/md/`.

Done means:
- output is under docs/questions/
- timestamp links use ?t=seconds
- questions are supported by transcript text
- table renders correctly
- README explicit episode list/status is updated if needed
- no new references point to src/md/ or transcripts/livestreams/md/