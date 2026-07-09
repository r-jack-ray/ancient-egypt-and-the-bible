---
name: transcript-to-md-reference
description: Create curated Ancient Egypt and the Bible Q&A Markdown pages under docs/questions from transcript sources under src/transcripts. Use for first-pass page creation with all real audience questions, direct searchable wording, transcript-grounded short and expanded answers, question-start timestamps, and YouTube links. Do not use for auditing or repairing an existing page.
---

# Transcript to MD Reference

## Overview

Create curated Markdown reference pages from livestream transcript files. The goal is not to reproduce the whole transcript. The goal is to make GitHub Pages readers able to:

- find real audience questions
- scan a short answer direction
- read a filled transcript-grounded expanded answer
- open the original video at the right timestamp

The public-facing Markdown output belongs under `docs/questions/`. Keep raw transcript source data under `src/`.

A master list of public livestream entries is in `src/live-stream-list.md`. Treat the list as stream-centric, not episode-only. It may include numbered Q&A livestreams, special streams, and other public `/streams` entries. Do not limit processing to numbered episodes unless the user explicitly asks for numbered episodes only.

This skill is for first-pass page creation with Codex. Use `transcript-question-page-audit` for later correction passes, completeness audits, timestamp repairs, or minimal-diff improvements to existing pages.

## Default Behavior

Default to creating the requested page or pages with full transcript coverage. Keep artifact completeness and validation independent of closeout length.

- Inspect the complete working transcript before claiming that a page includes all real audience questions.
- Candidate searches are an accelerator, not proof of completeness.
- Prefer high-confidence transcript-grounded wording over speculative cleanup.
- Do not add outside facts, even when they appear historically correct.
- In the final response, retain files created, question-row counts, validation performed, and every material blocker or uncertainty; trim introductions, repetition, and optional background first.

## Source Files

Use the current repository layout:

1. Routing index: `src/live-stream-list.md`
2. Source transcript: `src/transcripts/json/<slug>.json`
3. Working transcript: `src/transcripts/txt/<slug>.txt`
4. TSV only when exact seconds or generated links are useful.

Use TXT as the default curation surface. Use JSON as the source of record to resolve ambiguity, verify raw fields, or generate missing TXT.

If the JSON source exists but the TXT file is missing, generate TXT before curating:

```powershell
pwsh -NoProfile -File scripts/Convert-TranscriptJson.ps1 src/transcripts/json/12-the-quorum-of-the-twelve.json
```

If the converter reports no transcript segments, treat the JSON as an empty placeholder and do not invent a page. For TSV:

```powershell
pwsh -NoProfile -File scripts/Convert-TranscriptJson.ps1 src/transcripts/json/12-the-quorum-of-the-twelve.json -Format Tsv
```

## Output Location

Write curated Q&A Markdown pages under `docs/questions/`.

```text
docs/questions/<slug>-questions.md
```

If the slug already ends in `questions`, use `.md` instead of duplicating the word:

```text
docs/questions/5-five-and-even-more-questions.md
```

Use special-purpose filenames only when explicitly requested. Ordinary full Q&A pages use the source stream slug.

## Batch Selection

When the user asks for the "next" episode pages, use the next missing ordinary pages in ascending numbered order from `src/live-stream-list.md`, based on actual files under `docs/questions/`. Treat README/status text as hints only.

If a blocked placeholder appears in a batch, report it and continue only when later non-empty transcript sources can still satisfy the requested count. Preserve `src/live-stream-list.md` order for non-numbered streams unless the user gives another order.

## Creation Workflow

### 1. Route The Target

For each requested stream:

1. Identify the stream, episode number if present, title, URL, and slug.
2. Use `src/live-stream-list.md` to confirm the title, YouTube video URL, and slug.
3. Check whether the intended output page already exists under `docs/questions/`.
4. If it exists, do not overwrite it as a first-pass creation task. Use `transcript-question-page-audit` unless the user explicitly asks to regenerate or replace it.

### 2. Confirm Transcript Sources

1. Confirm the matching JSON source exists under `src/transcripts/json/`.
2. If JSON is missing, report the blocker and stop processing that stream.
3. Confirm the matching TXT working transcript exists under `src/transcripts/txt/`.
4. If TXT is missing and JSON is non-empty, run `scripts/Convert-TranscriptJson.ps1` for that JSON file.
5. If conversion reports no transcript segments, treat the JSON as an empty placeholder and do not create a fabricated page.

### 3. Establish Full Transcript Coverage

A normal first-pass page requires full coverage.

Full coverage means:

- inspect the TXT transcript from beginning to end
- use contiguous bounded windows with overlap so no transcript range is skipped
- use a small overlap, usually 10-20 lines, between windows
- track the last inspected line or timestamp so coverage has no gaps
- inspect answer spans far enough to support both the short and expanded answer summaries
- expand a window when needed to capture a complete question or answer

Do not infer completeness from search hits alone.

### 4. Use Candidate Searches As An Accelerator

Use `rg`, `Select-String`, or similar tools to build a compact candidate list:

```powershell
Select-String -Path src/transcripts/txt/FILE.txt -Pattern '\b(asks|asked|question|wants to know|super chat)\b|Next question|Next one|\?' -CaseSensitive:$false
```

Likely markers may also include `what`, `why`, `how`, `where`, `when`, `who`, `does`, `did`, `is`, `are`, `can`, `could`, and `would`.

Inspect bounded context around candidates:

```powershell
Get-Content src/transcripts/txt/FILE.txt | Select-Object -Skip START -First COUNT
```

Use candidate results to prioritize attention, but continue sequential transcript inspection through unmatched ranges. Questions may be read without a question mark or explicit cue phrase.

### 5. Build A Complete Question Inventory

Before writing the Markdown table, identify every supported audience-question turn and retain enough working context for:

- question-start timestamp
- complete audience question wording
- relevant answer span
- inclusion or exclusion decision
- whether the turn contains one question or multiple distinct questions

Include real audience questions from:

- live chat
- super chats
- backlog questions
- questions read aloud by the host
- adjacent transcript fragments that form one audience question

Exclude:

- rules, greetings, thanks, and housekeeping
- repeated "thank you for the super chat" text
- topic transitions
- answer-only material
- jokes or banter without a real question
- speaker-created rhetorical questions unless they represent an audience question

For follow-up clusters, use one row when they are part of the same audience turn. Use separate rows when the transcript treats them as distinct questions.

Never limit a full Q&A page to super chats only.

### 6. Draft The Page

After completing the transcript inventory:

1. Order rows by the question-start timestamp.
2. Combine split transcript fragments into one readable question.
3. Use the question start, not the answer start, for the timestamp.
4. Add a short answer or answer direction only when the transcript clearly supports it.
5. Add a transcript-grounded expanded answer that gives the main reasoning, caveats, examples, or limits supported by the answer span.
6. Preserve uncertainty when the answer is incomplete or indirect.
7. Write the output under `docs/questions/`.

### 7. Verify Every Row

Before considering the page complete:

- verify every row against its supporting transcript area
- verify every timestamp points to the audience-question start
- verify every answer summary against the relevant answer span
- confirm that no candidate represents a missing real audience question
- confirm that the full TXT transcript was inspected without gaps
- confirm that no outside facts were added

Use TSV when exact seconds or generated links are difficult to validate from TXT. Use JSON only when TXT and TSV are insufficient.

### 8. Validate And Update Navigation

1. Validate that all table rows render cleanly.
2. Validate that timestamp display text matches the `?t=` seconds value.
3. Count the final question data rows.
4. Review the resulting diff.
5. Update navigation and status references, especially `README.md`, when adding or moving public curated pages.
6. If several pages were created in parallel, serialize shared-file updates such as `README.md`, indexes, status records, and `src/transcript-audit.log` through the parent agent.
7. Append the creation or regeneration tracking record only after the page and related changes have been validated.

## Existing Page Safety

Curated pages under `docs/questions/` may contain human-edited summaries. Do not bulk overwrite an existing curated page unless the user explicitly asks to regenerate or replace it.

When an existing page needs correction or improvement:

- use `transcript-question-page-audit`
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

| Time | Question | Short answer / answer direction | Expanded answer |
|---:|---|---|---|
| <a href="https://youtu.be/VIDEO_ID?t=136" target="_blank" rel="noopener noreferrer">2:16</a> | Did the Sea Peoples' attacks on Egypt under Merneptah and Ramesses III contribute to the end of the New Kingdom? | Yes, especially under Ramesses III, but the decline was a longer economic and political process. | The answer treats the Sea Peoples as one contributing pressure, especially in Ramesses III's reign, but not as a single-cause explanation. The decline is framed as a broader process involving economic and political strain as well as foreign attacks. |
```

For topic indexes or special-purpose pages, adapt the heading and table columns, but keep timestamp links in the first column unless the user asks for a different structure.
For ordinary full Q&A pages, do not use alternate column orders such as `Question | Time | Answer`; the timestamp column must be first.

## Timestamp And Link Rules

Use the timestamp where the audience question begins, not the answer start.

Markdown links cannot force new tabs on GitHub. For GitHub-friendly timestamp links intended to open in a new tab, use HTML anchors with both `target="_blank"` and `rel="noopener noreferrer"`:

```html
<a href="https://youtu.be/VIDEO_ID?t=123" target="_blank" rel="noopener noreferrer">2:03</a>
```

Keep the timestamp display human-readable:

```text
9:03
1:22:43
```

Keep the `?t=` value in seconds. Convert precisely:

```text
9:03 -> 543
1:22:43 -> 4963
```

When the TXT transcript line has only the display timestamp, convert it to seconds for the URL. When TSV exists, prefer its `StartSeconds` and generated `Link` values over hand conversion.

## Wording And Summary Rules

Question wording should create direct, searchable questions:

- write direct questions, not transcript fragments or topic labels
- preserve the user's wording when it helps specificity or searchability
- remove filler, false starts, and repeated setup when meaning is unchanged
- combine split transcript fragments and correct obvious transcript artifacts
- keep names, titles, Bible references, Egyptian terms, dates, and chronology markers searchable
- do not add context from the answer into the question
- do not silently resolve an unclear proper noun or technical term from outside knowledge

Answer wording should be concise, third-person, and useful in search results:

- write short and expanded answers as concise third-person summaries of the host's response
- reflect what the host actually says
- preserve caveats, uncertainty, disagreement, and limits
- avoid outside research
- do not begin routine answers with "He said," "He argued," or "He explained."
- use attribution only when the answer depends on the host's interpretation, uncertainty, disagreement, or stated opinion
- prefer compact phrasing suitable for search results, tables, and index pages
- preserve the difference between what the question asks and what the answer actually supports

Expanded answers:

- are required for ordinary pages unless the user explicitly asks to defer them
- must be transcript-grounded and useful as a standalone explanation
- keep expanded answers consistent with the short answer
- do not use outside research
- preserve caveats, uncertainty, and limits in the answer span
- do not merely repeat the short answer word-for-word unless no fuller answer is supported

Use uncertainty when needed:

```text
The transcript does not give a clear direct answer.
```

## Table Rules

Markdown table rows must render cleanly in GitHub and GitHub Pages.

- Use one table row per line.
- Use exactly four columns for ordinary pages.
- Use the exact ordinary-page header `| Time | Question | Short answer / answer direction | Expanded answer |`.
- Populate the expanded-answer cell with transcript-grounded prose for ordinary pages.
- Keep timestamp links in the first column.
- Ensure every ordinary-page data row begins with the timestamp anchor, followed by the question, the short answer, and then the expanded answer.
- Escape literal pipe characters inside cells as `\|`.
- Avoid raw newlines inside table cells.
- Keep the short-answer column concise enough to scan; keep expanded answers detailed enough to preserve the transcript-supported reasoning, examples, qualifications, and limits.
- Do not leave placeholder links or placeholder text. Do not use `_Expansion pending._` for ordinary pages under the filled-answer baseline unless the user explicitly asks to defer that page and accepts that strict validation will fail until it is resolved.
- If the transcript does not support a fuller answer, write a limited expanded answer that says so instead of using a placeholder.
- Verify each table row has the same number of unescaped pipe separators.
- Prefer a Markdown preview when a table contains HTML anchors, names with punctuation, or long question text.

Special-purpose pages may use an adapted structure when the requested subset requires it. Transcript-grounded notes after the table are allowed when clearly separated from Q&A rows.

## Navigation Expectations

Pages under `docs/questions/` are public-facing GitHub Pages content.

When adding new curated pages, update `README.md` if it maintains an explicit episode-link list or current-status summary. Compare `docs/questions/*.md` against the README curated episode list before finishing, and fix drift when the README claims a range or page count that no longer matches the files.

## Batch And Parallel Guidance

- Assign at most one semantic creation agent per source stream and output page.
- When processing multiple files in parallel, give each semantic subagent exclusive ownership of a distinct transcript and output page.
- Do not treat candidate-search output as complete transcript coverage.
- Do not let two agents create, regenerate, or review the same page concurrently.
- Serialize changes to shared files such as `README.md`, `docs/questions/index.md`, status notes, and `src/transcript-audit.log` through the parent agent.
- Semantic subagents must not append `src/transcript-audit.log`; return the validated counts and concise record note to the parent agent.
- If an agent cannot demonstrate full transcript coverage for its assigned file, do not describe that page as complete or append a successful creation record.

## Creation Tracking

Use `src/transcript-audit.log` as an append-only tracking record for completed page creation and explicit regeneration. The log records work history; it is not transcript evidence and must not influence the independent first-pass analysis.

Before writing, build the complete question inventory independently. Use `question_count_before=0` for new pages; for explicit regeneration, count the existing page's actual question rows first.

After writing and validation, count final question rows as `question_count_after` and calculate:

```text
question_count_change = question_count_after - question_count_before
```

Append exactly one record for each successfully created or regenerated page after validation. Preserve existing records without rewriting, sorting, or normalizing them. Do not append a success record for a blocked or uncreated page.

Record:

- ISO 8601 full local timestamp
- created or regenerated file short name and extension
- `coverage=full`
- `question_count_before`
- `question_count_after`
- `question_count_change`, including `+` for positive changes
- whether the file could use further inspection
- a concise note identifying first-pass creation or explicit regeneration and any important uncertainty

Use `could_use_further_inspection=yes` for ordinary first-pass creation because it has not received a separate audit pass. Do not describe first-pass creation as an audit.

Example first-pass record; replace placeholders and counts with actual values:

```text
2026-06-27T12:34:56-05:00 265-the-pharaoh-of-swing-questions.md; coverage=full; question_count_before=0; question_count_after=68; question_count_change=+68; could_use_further_inspection=yes; created first-pass page from full transcript coverage; separate audit not yet performed.
```

## Validation

After creating a page, run targeted checks:

```powershell
$path = "docs/questions/FILE.md"

Get-Content $path | Where-Object { $_ -match '^\|' } | ForEach-Object {
    $line = $_
    $unescaped = ([regex]::Matches($line, '(?<!\\)\|')).Count
    if ($unescaped -ne 5)
    {
        [pscustomobject]@{ Pipes = $unescaped; Line = $line }
    }
}

Select-String -Path $path -Pattern 'target="_blank" rel="noopener noreferrer"'
Select-String -Path $path -Pattern 'https://youtu\.be/[^"? ]+[" ]'
rg -n "\[PLACEHOLDER\]|_Expansion pending\\._" $path
git -c safe.directory=C:/Workspaces/ancient-egypt-and-the-bible diff --check -- $path
git -c safe.directory=C:/Workspaces/ancient-egypt-and-the-bible diff -- $path
```

Also:

- verify each display timestamp matches its `?t=` seconds value
- verify each row against the supporting transcript area
- verify the final question-row count excludes the table header, separator row, and transcript notes
- verify the full transcript coverage record has no skipped range
- inspect the page in a Markdown preview when practical

If a TXT file was generated for the stream, verify it exists under `src/transcripts/txt/` and that its line count matches the transcript segment count reported by the converter.

If a new curated page was added, ensure `README.md` links to the new page when the surrounding README section lists curated episodes or curated pages.

## Final Response

Lead with the result. For completed change tasks, use the repo's compact closeout shape when it fits:

- Changed:
- Files:
- Checked:
- Notes:

Keep every material result, check, blocker, and uncertainty. Omit optional transcript-analysis detail unless the user requests it.

## Done Checklist

A task using this skill is complete only when the relevant items are true:

- output is under `docs/questions/`
- an existing curated page was not overwritten without explicit user direction
- the TXT transcript was inspected from beginning to end without gaps
- candidate searches were used only as an accelerator, not as the sole completeness method
- all real audience-question turns found during full coverage were considered for inclusion
- retained questions are supported by transcript text
- retained questions are written as direct, searchable questions
- answer summaries are supported by transcript text and preserve uncertainty
- short and expanded answers use concise third-person phrasing and avoid routine "He said" openings
- no outside facts were added
- timestamps point to question starts
- timestamp links use `?t=` seconds
- timestamp display text is human-readable and matches the seconds value
- timestamp links include `target="_blank"` and `rel="noopener noreferrer"`
- ordinary Q&A rows use four columns with a non-empty expanded-answer cell
- expanded answers are populated with transcript-grounded prose for ordinary pages
- Markdown tables render cleanly
- no placeholder links remain
- `question_count_before`, `question_count_after`, and `question_count_change` agree
- the final question-row count was checked
- the creation or regeneration record was appended only after independent transcript analysis and page validation
- the recorded `coverage=full` matches the work actually performed
- ordinary first-pass creation records use `could_use_further_inspection=yes` and do not claim that an audit occurred
- no successful creation record was appended for a blocked or uncreated page
- generated TXT or TSV files, when created, were produced by `scripts/Convert-TranscriptJson.ps1`
- `README.md` explicit episode links and current-status text are updated when needed
- shared navigation or status files were updated serially
- the diff was reviewed
