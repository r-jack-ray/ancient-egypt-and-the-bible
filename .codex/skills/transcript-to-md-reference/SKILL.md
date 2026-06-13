---
name: transcript-to-md-reference
description: Convert Ancient Egypt and the Bible livestream transcript exports into curated GitHub-readable Q&A reference pages. Use when Codex needs to turn transcript TSV/JSON files under transcripts/livestreams into MD files with all real audience questions, short answer summaries, timestamps, and direct YouTube links like transcripts/livestreams/md/6-all-of-this-has-happened-before-questions.md.
---

# Transcript to MD Reference

## Overview

Create curated Markdown reference pages from livestream transcript files. The goal is not to reproduce the whole transcript; it is to make GitHub readers able to find any real audience question, scan a short answer direction, and jump to the video at the right time.

## Source Files

Prefer `transcripts/livestreams/tsv/*.tsv` when available because it already has `Timestamp`, `Text`, and `Link` columns. Use `json/*.json` only when TSV is missing or a timestamp needs auditing.

Use `transcripts/livestreams/live-stream-list.md` to confirm the episode title, YouTube video URL, and slug.

## Workflow

1. Identify the target episode number and slug.
2. Read the TSV around likely question starts using `rg`, `Select-String`, or bounded `Get-Content` inspection.
3. Find real audience question starts, including super chats, regular chat questions, and questions read from any backlog. Never limit the page to super chats only.
4. Expand each question across adjacent transcript rows until the question is complete.
5. Add a short answer / answer direction only when the transcript clearly supports it.
6. Write the output under `transcripts/livestreams/md/`.
7. Validate that table rows render cleanly and timestamp links point to the right YouTube time.

## Output Format

Use this structure for curated Q&A pages:

```markdown
# Questions in Livestream 6

Live Stream #6: All of This has Happened Before...

Time links open the YouTube video at the relevant timestamp. The links use HTML anchors so GitHub can render them with `target="_blank"`.

| Time | Question | Short answer / answer direction |
|---:|---|---|
| <a href="https://youtu.be/XcN_Xhr8bPM?t=136" target="_blank" rel="noopener noreferrer">2:16</a> | Did the Sea Peoples' attacks on Egypt under Merneptah and Ramesses III contribute to the end of the New Kingdom? | Yes, especially under Ramesses III, but the decline was a longer economic and political process. |
```

For other topic indexes, adapt the table columns, but keep timestamp links in the first column.

## Link Rules

Markdown links cannot force new tabs on GitHub. Use HTML anchors:

```html
<a href="https://youtu.be/VIDEO_ID?t=123" target="_blank" rel="noopener noreferrer">2:03</a>
```

Keep the timestamp display human-readable (`9:03`, `1:22:43`) and keep the `?t=` value in seconds.

## Curation Rules

- Do not invent transcript content or answer summaries.
- Preserve uncertainty when the transcript is unclear.
- Include all real questions supported by the transcript, not only super chats.
- Clean obvious transcript artifacts only when the intended wording is clear.
- Prefer concise summaries over long paraphrases.
- Omit non-question setup, housekeeping, and closing thanks unless the page is explicitly meant to index them.
- Exclude repeated "thank you for the super chat" fragments unless they introduce the actual question.
- Keep table cells short enough to scan on GitHub.

## Validation

After editing, run quick local checks:

```powershell
Select-String -Path transcripts/livestreams/md/FILE.md -Pattern 'target="_blank"'
rg -n "\[Watch on YouTube\]|\[PLACEHOLDER\]" transcripts/livestreams/md/FILE.md
```

For tables, verify each row has the same number of pipe characters or inspect in a Markdown preview.
