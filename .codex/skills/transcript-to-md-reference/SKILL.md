---
name: transcript-to-md-reference
description: Convert Ancient Egypt and the Bible livestream transcript exports and generated TXT working transcripts into curated GitHub Pages Q&A reference pages. Use when Codex needs to turn source files under src/transcripts into Markdown files under docs/questions with all real audience questions, short transcript-grounded answer summaries, question-start timestamps, and direct YouTube links like docs/questions/6-all-of-this-has-happened-before-questions.md. Do not use for auditing or repairing an existing question page; use transcript-question-page-audit for that work.
---

# Transcript to MD Reference

## Overview

Create curated Markdown reference pages from livestream transcript files. The goal is not to reproduce the whole transcript. The goal is to make GitHub Pages readers able to:

- find real audience questions
- scan a short answer direction
- open the original video at the right timestamp

The public-facing Markdown output belongs under `docs/questions/`. Keep raw transcript source data under `src/`.

A master list of public livestream entries is in `src/live-stream-list.md`. Treat the list as stream-centric, not episode-only. It may include numbered Q&A livestreams, special streams, and other public `/streams` entries. Do not limit processing to numbered episodes unless the user explicitly asks for numbered episodes only.

This skill is for first-pass page creation with Codex. Use `transcript-question-page-audit` for later correction passes, completeness audits, timestamp repairs, or minimal-diff improvements to existing pages.

## Default Behavior

Default to creating the requested page or pages with full transcript coverage and minimal user-facing output.

- Inspect the complete working transcript before claiming that a page includes all real audience questions.
- Candidate searches are an accelerator, not proof of completeness.
- Prefer high-confidence transcript-grounded wording over speculative cleanup.
- Do not add outside facts, even when they appear historically correct.
- Keep the final response concise: files created, question-row counts, validation performed, and important blockers or uncertainties.

## Model And Reasoning Requirements

This skill is intended for Codex execution. Do not route semantic transcript work to a local-AI model, an MCP-served local model, or another external inference system unless the user explicitly requests that override.

When this skill uses Codex subagents, choose or define agent profiles that inherit the model and reasoning-effort setting selected for the parent session.

Semantic creation work includes:

- finding all real audience questions
- deciding question inclusion or exclusion
- interpreting transcript fragments
- determining whether adjacent fragments form one question or separate questions
- choosing readable question wording
- writing short answer summaries
- resolving question-start timestamps
- creating or editing the question page

For semantic creation work:

- omit `model` and `model_reasoning_effort` from custom agent configuration
- do not select an agent profile that overrides or downgrades either setting
- keep all semantic decisions with an agent inheriting the parent settings
- do not use local AI as a substitute when Codex usage is constrained

Mechanical helper work includes file discovery, row counting, Markdown validation, link checking, timestamp arithmetic, and repository checks. Mechanical helpers should also inherit the parent settings by default. Use a different model or reasoning effort only when the user explicitly requests that override.

## Source Files

Use `src/transcripts/json/*.json` as the source of record.

Use `src/transcripts/txt/*.txt` as the default working transcripts for efficient inspection and Q&A curation. These TXT files are derived from the JSON files and should have the same base slug:

```text
src/transcripts/json/12-the-quorum-of-the-twelve.json
src/transcripts/txt/12-the-quorum-of-the-twelve.txt
```

The generated TXT corpus should normally cover all non-empty JSON transcript exports.

Use `src/live-stream-list.md` to confirm:

- stream identifier or episode number, when present
- stream title
- YouTube video URL
- slug and filename pattern

If the JSON source is missing for a stream listed in `src/live-stream-list.md`, report the missing transcript source and do not invent a curated page.

If the JSON source exists but the TXT file is missing, generate TXT before curating:

```powershell
pwsh -NoProfile -File scripts/Convert-TranscriptJson.ps1 src/transcripts/json/12-the-quorum-of-the-twelve.json
```

The converter writes to `src/transcripts/txt/` by default, overwrites generated output by default, and emits one line per transcript segment:

```text
[22] 3:58 okay um how prevalent were the gnostics in egypt
```

If the converter reports that no transcript segments were found, treat the JSON as an empty placeholder. Do not invent a curated page. Note the blocker and move to the next requested stream only when the user asked for a batch such as "next two episodes" or "next two streams."

Known documented transcript blockers may exist, such as disabled-transcript placeholder JSON files. Confirm current blockers from `README.md`, `AGENTS.md`, the JSON file contents, and converter output before reporting final status.

For structured processing, the same script can emit TSV under `src/transcripts/tsv/`:

```powershell
pwsh -NoProfile -File scripts/Convert-TranscriptJson.ps1 src/transcripts/json/12-the-quorum-of-the-twelve.json -Format Tsv
```

Use TSV when many exact `StartSeconds` values or generated links need to be resolved or validated.

Do not read the full JSON when TXT or TSV already supplies the necessary transcript content and timing. Use JSON only when the derived files cannot answer a specific source question.

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
- inspect answer spans far enough to support each short summary
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
5. Preserve uncertainty when the answer is incomplete or indirect.
6. Write the output under `docs/questions/`.

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

| Time | Question | Short answer / answer direction |
|---:|---|---|
| <a href="https://youtu.be/VIDEO_ID?t=136" target="_blank" rel="noopener noreferrer">2:16</a> | Did the Sea Peoples' attacks on Egypt under Merneptah and Ramesses III contribute to the end of the New Kingdom? | Yes, especially under Ramesses III, but the decline was a longer economic and political process. |
```

For topic indexes or special-purpose pages, adapt the heading and table columns, but keep timestamp links in the first column unless the user asks for a different structure.

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

Question wording may be cleaned for readability, but stay conservative:

- remove filler only when meaning is unchanged
- combine split transcript fragments
- correct obvious transcript artifacts
- preserve names, titles, Bible references, Egyptian terms, dates, and chronology markers
- do not add context from the answer into the question
- do not silently resolve an unclear proper noun or technical term from outside knowledge

Short answers must be transcript-grounded:

- reflect what the speaker actually says
- preserve caveats and uncertainty
- stay short enough for table scanning
- avoid outside research
- preserve the difference between what the question asks and what the answer actually supports

Use uncertainty when needed:

```text
The transcript does not give a clear direct answer.
```

## Table Rules

Markdown table rows must render cleanly in GitHub and GitHub Pages.

- Use one table row per line.
- Use exactly three columns for ordinary pages.
- Keep timestamp links in the first column.
- Escape literal pipe characters inside cells as `\|`.
- Avoid raw newlines inside table cells.
- Keep answer summaries short enough to scan.
- Do not leave placeholder links or placeholder text.
- Verify each table row has the same number of unescaped pipe separators.
- Prefer a Markdown preview when a table contains HTML anchors, names with punctuation, or long question text.

Special-purpose pages may use an adapted structure when the requested subset requires it. Transcript-grounded notes after the table are allowed when clearly separated from Q&A rows.

## Navigation Expectations

Pages under `docs/questions/` are public-facing GitHub Pages content.

When adding new curated pages, update `README.md` if it maintains an explicit episode-link list or current-status summary. Compare `docs/questions/*.md` against the README curated episode list before finishing, and fix drift when the README claims a range or page count that no longer matches the files.

`docs/index.html` is the GitHub Pages search page. It should search the public reference content under `docs/questions/`. If it still contains copied template text or searches an unrelated path such as `/src/main/resources/sql`, update it or report the mismatch as part of the task.

For a large number of pages, prefer a grouped Markdown index under `docs/questions/`, leaving the existing `docs/index.html` search page intact unless the search UI itself needs to change:

```text
docs/questions/index.md
docs/questions/1-the-debug-episode-questions.md
docs/questions/2-bugs-bugs-and-fixes-questions.md
```

If migrating old generated pages, move them from `src/md/` or `transcripts/livestreams/md/` to `docs/questions/` and update any README, index, or search-page references that still point at old locations.

## Batch And Parallel Guidance

- Assign at most one semantic creation agent per source stream and output page.
- When processing multiple files in parallel, give each semantic subagent exclusive ownership of a distinct transcript and output page.
- Every semantic subagent must inherit the parent session's model and reasoning effort.
- Do not use local AI for semantic page creation unless the user explicitly requests it.
- Do not treat candidate-search output as complete transcript coverage.
- Do not let two agents create, regenerate, or review the same page concurrently.
- Serialize changes to shared files such as `README.md`, `docs/questions/index.md`, status notes, and `src/transcript-audit.log` through the parent agent.
- Semantic subagents must not append `src/transcript-audit.log`; return the validated counts and concise record note to the parent agent.
- If an agent cannot demonstrate full transcript coverage for its assigned file, do not describe that page as complete or append a successful creation record.

## Creation And Regeneration Tracking

Use `src/transcript-audit.log` as an append-only tracking record for completed page creation and explicit regeneration. The log records work history; it is not transcript evidence and must not influence the independent first-pass analysis.

### Before Writing

- Do not read or use previous audit-log entries before independently evaluating the transcript and building the complete question inventory.
- Determine `question_count_before`:
  - use `0` when creating a page that does not already exist
  - when the user explicitly requested regeneration or replacement, count the existing page's actual question data rows before changing it
- Count only actual question rows. Do not count the table header, separator row, or transcript notes.

### After Writing And Validation

- Count the final question data rows as `question_count_after`.
- Calculate:

```text
question_count_change = question_count_after - question_count_before
```

- Confirm that `question_count_before`, `question_count_after`, and `question_count_change` agree.
- After the independent creation or regeneration work is complete, search only for existing log entries matching the target filename when prior history may help identify unresolved concerns or compare earlier work.
- Treat previous entries as clues and history, never as proof that a question, answer summary, or timestamp is correct.
- Do not read or summarize the entire audit log merely to process one page.
- Append exactly one new record for each successfully created or regenerated page.
- Preserve all existing records without rewriting, sorting, or normalizing them.
- Do not add or infer an `audit_pass` number. The existing log does not guarantee a complete audit sequence.
- Do not append a success record when a page was not created because of a missing, empty, or otherwise blocked transcript source.
- In batch work, semantic subagents must not append the shared log. The parent agent appends records serially after validating each page.

Record:

- ISO 8601 full local timestamp
- created or regenerated file short name and extension
- semantic creation model
- semantic creation reasoning effort
- `coverage=full`
- `question_count_before`
- `question_count_after`
- `question_count_change`, including `+` for positive changes
- whether the file could use further inspection
- a concise note identifying first-pass creation or explicit regeneration and any important uncertainty

For `could_use_further_inspection`:

- use `yes` for ordinary first-pass creation because the page has not yet received a separate audit pass
- for an explicit regeneration, use `yes` when material uncertainty remains and `no` only when no important unresolved concern was found
- do not describe a first-pass creation record as an audit

For model and effort fields:

- record runtime-reported values when available
- otherwise record the parent session's selected values because semantic agents are required to inherit them
- if a value cannot be determined, record `unknown`
- do not record a mechanical helper's model or effort as the semantic creation model or effort
- do not guess a model name from behavior or output quality

Example first-pass record; replace placeholders and counts with actual values:

```text
2026-06-27T12:34:56-05:00 265-the-pharaoh-of-swing-questions.md; model=MODEL_NAME; effort=EFFORT_LEVEL; coverage=full; question_count_before=0; question_count_after=68; question_count_change=+68; could_use_further_inspection=yes; created first-pass page from full transcript coverage; separate audit not yet performed.
```

Existing records in older formats may remain unchanged.

## Validation

After creating a page, run targeted checks:

```powershell
$path = "docs/questions/FILE.md"

Get-Content $path | Where-Object { $_ -match '^\|' } | ForEach-Object {
    $line = $_
    $unescaped = ([regex]::Matches($line, '(?<!\\)\|')).Count
    if ($unescaped -ne 4)
    {
        [pscustomobject]@{ Pipes = $unescaped; Line = $line }
    }
}

Select-String -Path $path -Pattern 'target="_blank" rel="noopener noreferrer"'
Select-String -Path $path -Pattern 'https://youtu\.be/[^"? ]+[" ]'
rg -n "\[Watch on YouTube\]|\[PLACEHOLDER\]|transcripts/livestreams/md|src/md" $path
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

Keep the final response short. Report:

- created page paths
- actual question-row count for each page
- validation performed
- confirmation that the creation or regeneration record was appended
- blockers or material uncertainty

Do not provide a long transcript-analysis report unless the user explicitly requests one.

## Done Checklist

A task using this skill is complete only when the relevant items are true:

- output is under `docs/questions/`
- no new public Q&A output was written under `src/md/` or `transcripts/livestreams/md/`
- an existing curated page was not overwritten without explicit user direction
- the TXT transcript was inspected from beginning to end without gaps
- candidate searches were used only as an accelerator, not as the sole completeness method
- all real audience-question turns found during full coverage were considered for inclusion
- retained questions are supported by transcript text
- answer summaries are supported by transcript text and preserve uncertainty
- no outside facts were added
- timestamps point to question starts
- timestamp links use `?t=` seconds
- timestamp display text is human-readable and matches the seconds value
- timestamp links include `target="_blank"` and `rel="noopener noreferrer"`
- Markdown tables render cleanly
- no placeholder or legacy links remain
- `question_count_before`, `question_count_after`, and `question_count_change` agree
- the final question-row count was checked
- the creation or regeneration record was appended only after independent transcript analysis and page validation
- the recorded `coverage=full` matches the work actually performed
- ordinary first-pass creation records use `could_use_further_inspection=yes` and do not claim that an audit occurred
- no successful creation record was appended for a blocked or uncreated page
- generated TXT or TSV files, when created, were produced by `scripts/Convert-TranscriptJson.ps1`
- `README.md` explicit episode links and current-status text are updated when needed
- `docs/index.html` searches `docs/questions/` or the mismatch is reported
- semantic subagents, when used, inherited the parent model and reasoning effort
- no local AI was used for semantic work unless the user explicitly requested it
- shared navigation or status files were updated serially
- the diff was reviewed
