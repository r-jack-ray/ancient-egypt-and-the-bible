---
name: transcript-question-page-audit
description: Audit and repair existing Ancient Egypt and the Bible curated question Markdown pages against TXT and JSON YouTube transcript sources. Use for correction passes, timestamp verification, missing-question detection, unsupported answer summary review, Markdown table cleanup, and minimal-diff repair of files under docs/questions. Do not use for first-pass transcript-to-Markdown generation.
---

# Transcript Question Page Audit

## Overview

Audit and repair existing curated Q&A Markdown pages for the Ancient Egypt and the Bible livestream transcript project.

This skill is for accuracy-focused correction passes over existing files under:

```text
docs/questions/
```

The goal is not to regenerate pages from scratch. The goal is to verify that each existing row is supported by the transcript, correct bad timestamps, add clearly missing real audience questions, and remove or revise unsupported material.

Use this skill when the user asks to:

* audit an existing question page
* improve accuracy after an earlier AI generation pass
* verify timestamps
* find missing questions
* repair unsupported or overstated short answers
* clean Markdown table structure
* do a careful correction pass over prior AI output

Do not use this skill for first-pass transcript-to-Markdown generation. Use `transcript-to-md-reference` for initial page creation.

## Source of Truth

Use the JSON transcript as the source of record:

```text
src/transcripts/json/*.json
```

Use the TXT transcript as the default readable working transcript:

```text
src/transcripts/txt/*.txt
```

The TXT file is derived from the JSON and is useful for fast inspection, but the JSON remains authoritative for exact transcript source data.

When exact timestamps or generated links need careful audit, use TSV output if available or generate it from the JSON using the existing converter workflow.

Use `src/live-stream-list.md` to confirm the stream title, YouTube URL, video ID, and slug when a page title, source slug, or timestamp link is uncertain. Treat the live stream list as the routing index and the JSON transcript as the transcript source of record.

Expected matching source pattern:

```text
src/transcripts/json/265-the-pharaoh-of-swing.json
src/transcripts/txt/265-the-pharaoh-of-swing.txt
docs/questions/265-the-pharaoh-of-swing-questions.md
```

Some public pages are special-purpose indexes whose filename does not exactly match the transcript slug, such as super-chat-only pages. For those, identify the source stream from the page heading, links, README references, `src/live-stream-list.md`, or nearby transcript filename before auditing. Do not assume the Markdown filename alone proves the transcript source.

## Output Scope

Repair existing public Q&A Markdown pages only under:

```text
docs/questions/
```

Do not write new public Q&A output under:

```text
src/md/
transcripts/livestreams/md/
```

Those are legacy or incorrect output locations for the current GitHub Pages layout.

Do not create a new curated page during an audit task unless the user explicitly asks for creation. If an expected page is missing, report that as a blocker or route the task to `transcript-to-md-reference` when the user wants first-pass generation.

## Correction Mode Principles

When improving an existing page:

1. Treat the existing Markdown page as a draft, not as source of truth.
2. Do not bulk-regenerate the page unless the user explicitly asks for replacement or the page is structurally unusable.
3. Prefer minimal diffs.
4. Preserve correct rows.
5. Preserve useful human-edited curation.
6. Fix rows that are unsupported, incomplete, duplicated, malformed, or timestamped incorrectly.
7. Add missing real audience questions only when the transcript clearly supports them.
8. Remove or revise non-question housekeeping rows unless the user asked for those to be indexed.
9. Do not invent question wording, answer summaries, or context.
10. Preserve uncertainty when the transcript is unclear.
11. Keep evidence close to every fix: know the transcript row, timestamp, or JSON/TSV field that supports each changed row before editing.

Accuracy is more important than polish.

## Recommended Workflow

### 1. Identify the target files

For a page under `docs/questions/`, identify the matching TXT and JSON files.

Example:

```text
docs/questions/265-the-pharaoh-of-swing-questions.md
src/transcripts/txt/265-the-pharaoh-of-swing.txt
src/transcripts/json/265-the-pharaoh-of-swing.json
```

If the matching TXT file is missing but the JSON exists, generate the TXT using the repository transcript converter before auditing.

If the converter reports that no transcript segments were found, treat the JSON as an empty placeholder and do not fabricate a curated audit result.

If the JSON file is missing, report the blocker and do not guess from the existing Markdown page.

### 2. Inspect the existing Markdown page

Check:

* title and introductory text
* table columns
* timestamp link format
* row count
* duplicated rows
* malformed table rows
* rows compressed onto very long lines
* unescaped pipe characters inside table cells
* placeholder links or broken timestamp links
* legacy paths or stale generated content
* special-purpose scope notes, transcript notes, or other extra sections after the table

### 3. Audit the transcript for questions

Use the TXT transcript for readable review.

Search for likely question markers:

```text
?
question
asks
asked
super chat
what
why
how
where
when
who
does
did
is
are
can
could
would
should
```

Search hits are only candidates. Review bounded context around each hit so that the actual question start, complete wording, and answer direction are supported. The generated TXT line format normally includes a segment index and display timestamp, which is useful for keeping evidence tied to each candidate:

```text
[22] 3:58 transcript text
```

When a candidate spans multiple adjacent transcript rows, inspect the neighboring rows rather than forcing one row to carry the whole question.

Include real audience questions from:

* live chat
* super chats
* backlog questions
* questions read aloud by the host
* multi-part questions split across adjacent transcript segments

Do not include:

* ordinary lecture statements
* housekeeping
* greetings
* repeated thanks
* transition phrases
* jokes without a real question
* answer-only content
* speaker-created rhetorical questions unless they are clearly reading or representing an audience question

### 4. Verify each existing row

For every row in the existing Markdown table, verify:

* the question appears in the transcript
* the question wording is complete enough to be useful
* the timestamp points to the start of the question, not the answer
* the linked YouTube video ID matches the source stream
* the short answer is supported by the transcript
* the answer summary does not overstate the speaker's claim
* uncertainty is preserved when the transcript is unclear
* extra sections such as transcript notes are supported by the transcript and clearly separated from the Q&A table

### 5. Identify missing questions

Add a missing question only when all of these are true:

* the transcript clearly contains a real audience question
* the question is relevant to the stream Q&A index
* the question is not already represented by an existing row
* the answer direction can be summarized from the transcript, or uncertainty can be stated honestly
* the start timestamp can be determined

Do not add speculative questions inferred from the answer.

If a transcript contains a cluster of follow-up questions on the same topic, use one row only when they are part of the same audience turn and the combined wording remains faithful. Use separate rows when distinct audience questions are asked or answered separately.

### 6. Repair the page

Make focused edits:

* correct timestamps
* revise unsupported summaries
* complete truncated question wording
* split rows that merged two distinct questions
* merge duplicated rows when they represent the same question
* add clearly missing questions
* remove non-question rows
* fix table formatting
* preserve or repair supported transcript notes outside the table
* preserve existing correct content

Do not rewrite the whole file for style alone.

## Timestamp Rules

Use the timestamp where the audience question begins.

Do not use:

* the answer start
* the nearest topic transition
* a later paraphrase
* a timestamp where the host is already answering

Display timestamps in human-readable form:

```text
9:03
1:22:43
```

Links must use `?t=` seconds.

Example:

```html
<a href="https://youtu.be/VIDEO_ID?t=543" target="_blank" rel="noopener noreferrer">9:03</a>
```

Convert display timestamps to seconds precisely:

```text
9:03 -> 543
1:22:43 -> 4963
```

When TSV output is available, prefer the `StartSeconds` value and generated link over hand conversion.

For GitHub-friendly links that should open in a new tab, use HTML anchors with both:

```text
target="_blank"
rel="noopener noreferrer"
```

## Question Wording Rules

Make question text readable, but do not over-normalize.

Allowed cleanup:

* remove filler words when meaning is unchanged
* combine split transcript fragments into one complete question
* correct obvious transcript artifacts when the intended wording is clear
* preserve important names, book titles, Bible references, Egyptian terms, dates, and chronology markers

Avoid:

* making the question more sophisticated than the transcript supports
* changing the topic
* adding missing context not present in the transcript
* turning the speaker's later answer into part of the question
* hiding ambiguity

If wording is unclear, keep the wording conservative.

## Short Answer Rules

The short answer / answer direction should be brief and transcript-grounded.

Good answer summaries:

* reflect what the speaker actually says
* preserve caveats
* preserve uncertainty
* avoid adding outside research
* stay short enough to scan in a table

Bad answer summaries:

* answer more strongly than the transcript does
* import facts not in the transcript
* smooth over uncertainty
* turn a partial answer into a complete answer
* make claims the speaker did not make

When the transcript does not support a strong answer, use wording such as:

```text
The transcript does not give a clear direct answer.
```

or:

```text
He gives a partial answer, but the transcript does not clearly support a stronger summary.
```

## Table Format

Ordinary question pages should use this structure:

```markdown
# Questions in Livestream 265

Live Stream #265: The Pharaoh of Swing

Time links open the YouTube video at the relevant timestamp.

| Time | Question | Short answer / answer direction |
|---:|---|---|
| <a href="https://youtu.be/VIDEO_ID?t=543" target="_blank" rel="noopener noreferrer">9:03</a> | Question text? | Short supported answer. |
```

Rules:

* one table row per line
* exactly three columns for ordinary Q&A pages
* timestamp link in the first column
* question in the second column
* short answer / answer direction in the third column
* escape literal pipe characters inside cells as `\|`
* avoid raw newlines inside table cells
* avoid placeholder links
* keep rows readable in GitHub source view

Special-purpose pages may adapt the heading, intro note, or columns if they already have a narrower scope. Preserve a supported special-purpose structure unless it is broken or misleading. Ordinary full-stream pages should keep exactly the three-column structure above.

Extra notes after the table are allowed when they are transcript-grounded and useful, for example an errata or transcript note. Keep them outside the table and verify their timestamp links the same way as Q&A rows.

## Audit-Only Mode

When the user asks for an audit, review, or report only, do not edit files.

Return a report with these sections:

```markdown
## Audit Report

### Page
`docs/questions/FILE.md`

### Overall Status
PASS / NEEDS FIX / STRUCTURAL ISSUE

### Supported Rows
- timestamp - short note

### Questionable or Wrong Timestamps
- current timestamp - issue - recommended timestamp

### Unsupported or Overstated Summaries
- timestamp - issue - suggested correction

### Incomplete or Over-Normalized Questions
- timestamp - issue - suggested correction

### Missing Likely Questions
- timestamp - transcript evidence - suggested row

### Non-Question or Housekeeping Rows
- timestamp - reason

### Formatting and Link Issues
- issue list

### Recommended Repair Plan
1. highest-confidence fix
2. next fix
3. items needing human review
```

Do not modify files in audit-only mode.

## Repair Mode

When the user asks to fix, repair, correct, or update the page:

1. Read the existing Markdown page.
2. Read the matching TXT transcript.
3. Consult the JSON or TSV for exact timing and links when needed.
4. Make minimal edits.
5. Validate Markdown table structure.
6. Validate timestamp links.
7. Re-check every changed question and answer against transcript evidence.
8. Review the git diff.
9. Report what changed and what remains uncertain.

The final response should include:

```markdown
## Changes Made
- concise summary

## Validation
- checks run
- results

## Remaining Uncertainties
- items needing human review, or "None found"
```

## Batch Audit Guidance

For multiple files, prefer read-only batch audit first.

Recommended batch sizes:

```text
1 file at a time for difficult or questionable streams
3-5 files per batch for normal semantic audits
10+ files only for mechanical link/table validation
```

Parallel subagents may be used for read-only auditing, but not for simultaneous edits to the same files.

When using subagents:

* assign one file or one small group of files per subagent
* require audit reports only
* do not allow subagents to edit files
* consolidate findings in the main agent
* apply actual edits from the main agent only

## Validation Commands

Run targeted checks after editing.

Check for expected new-tab anchor pattern:

```powershell
Select-String -Path docs/questions/FILE.md -Pattern 'target="_blank" rel="noopener noreferrer"'
```

Check for placeholder or old link patterns:

```powershell
rg -n "\[Watch on YouTube\]|\[PLACEHOLDER\]" docs/questions/FILE.md
```

Check for likely YouTube timestamp links missing `?t=` seconds:

```powershell
Select-String -Path docs/questions/FILE.md -Pattern 'https://youtu\.be/[^"? ]+[" ]'
```

Check for legacy output paths:

```powershell
rg -n "transcripts/livestreams/md|src/md" docs README.md
```

Check for malformed table rows using a quick script or manual inspection.

PowerShell helper for unescaped pipe counts:

```powershell
$path = "docs/questions/FILE.md"
Get-Content $path | Where-Object { $_ -match '^\|' } | ForEach-Object {
    $line = $_
    $unescaped = ([regex]::Matches($line, '(?<!\\)\|')).Count
    [pscustomobject]@{
        Pipes = $unescaped
        Line = $line
    }
} | Format-Table -AutoSize
```

For a normal three-column Markdown table, data rows should have four unescaped pipe characters:

```text
| col1 | col2 | col3 |
```

The separator row should also match the same column count.

After edits, review the diff for scope:

```powershell
git -c safe.directory=C:/Workspaces/ancient-egypt-and-the-bible diff -- docs/questions/FILE.md
```

## Done Checklist

A correction task using this skill is complete only when the relevant items are true:

* existing correct rows were preserved
* no bulk rewrite occurred unless explicitly requested
* all retained questions are supported by transcript text
* added questions are real audience questions supported by the transcript
* timestamps point to question starts
* timestamp links use `?t=` seconds
* timestamp display text is human-readable
* HTML timestamp links include `target="_blank"` and `rel="noopener noreferrer"`
* short answers are supported by the transcript
* uncertainty is preserved where needed
* no unsupported outside facts were added
* non-question housekeeping rows were removed or left only with a clear reason
* Markdown table rows render cleanly
* literal pipe characters inside table cells are escaped
* no placeholder links remain
* no new public Q&A output was written under legacy paths
* special-purpose page scope notes and transcript notes are preserved only when supported
* git diff was reviewed
* remaining uncertain items were reported for human review
