---
name: transcript-to-md-reference
description: Convert livestream transcript exports in this repository into curated GitHub-readable Markdown reference pages. Use when Codex needs to turn transcript TSV/JSON files under transcripts/livestreams into MD files with questions, short answer summaries, timestamps, and direct YouTube links like transcripts/livestreams/md/208-super-chat-questions.md.
---

# Transcript to MD Reference

## Overview

Create curated Markdown reference pages from livestream transcript files. The goal is not to reproduce the whole transcript; it is to make GitHub readers able to find a question or topic, scan a short answer direction, and jump to the video at the right time.

## Source Files

Prefer `transcripts/livestreams/tsv/*.tsv` when available because it already has `Timestamp`, `Text`, and `Link` columns. Use `json/*.json` only when TSV is missing or a timestamp needs auditing.

Use `transcripts/livestreams/live-stream-list.md` to confirm the episode title, YouTube video URL, and slug.

## Workflow

1. Identify the target episode number and slug.
2. Read the TSV around likely question starts using `rg`, `Select-String`, or bounded `Get-Content` inspection.
3. Find real question starts, not answer endings or repeated "thank you for the super chat" fragments.
4. Expand each question across adjacent transcript rows until the question is complete.
5. Add a short answer / answer direction only when the transcript clearly supports it.
6. Write the output under `transcripts/livestreams/md/`.
7. Validate that table rows render cleanly and timestamp links point to the right YouTube time.

## Output Format

Use this structure for curated Q&A pages:

```markdown
# Super Chat Questions in Livestream 208

Live Stream #208: Hysterical Context Error

Time links open the YouTube video at the relevant timestamp. The links use HTML anchors so GitHub can render them with `target="_blank"`.

| Time | Question | Short answer / answer direction |
|---:|---|---|
| <a href="https://youtu.be/wf4G-NcyCe4?t=543" target="_blank" rel="noopener noreferrer">9:03</a> | Did Egyptians actually think the brain was useless? | No. They knew brain injury affected the person, but did not know exactly what the brain did. |
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
- Clean obvious transcript artifacts only when the intended wording is clear.
- Prefer concise summaries over long paraphrases.
- Omit non-question setup, housekeeping, and closing thanks unless the page is explicitly meant to index them.
- Keep table cells short enough to scan on GitHub.

## Validation

After editing, run quick local checks:

```powershell
Select-String -Path transcripts/livestreams/md/FILE.md -Pattern 'target="_blank"'
rg -n "\[Watch on YouTube\]|\[PLACEHOLDER\]" transcripts/livestreams/md/FILE.md
```

For tables, verify each row has the same number of pipe characters or inspect in a Markdown preview.
