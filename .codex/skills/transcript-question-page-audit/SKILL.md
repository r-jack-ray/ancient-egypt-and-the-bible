---
name: transcript-question-page-audit
description: Find and fix issues in existing Ancient Egypt and the Bible curated question Markdown pages under docs/questions against TXT and JSON transcript sources. Use for low-output correction passes, timestamp verification, missing-question repair, unsupported answer cleanup, table/link validation, and minimal-diff edits. Do not use for first-pass transcript-to-Markdown generation.
---

# Transcript Question Page Audit

## Default Behavior

Default to **find and fix** with minimal user-facing output.

- Edit the target page when the user asks to audit, check, repair, fix, correct, update, or improve it.
- Do not return a long audit report unless the user explicitly asks for "audit-only", "report only", "do not edit", or "review only".
- Keep final output terse: what changed, checks run, and any important uncertainty.
- Prefer high-confidence fixes over speculative edits.
- For missing-question or completeness audits, inspect the entire working transcript; high confidence limits what is changed, not how much of the transcript is covered.
- Do not invent transcript content or outside facts.

Use `transcript-to-md-reference` instead for first-pass page creation.

## Model And Reasoning Requirements

When this skill uses subagents, choose or define agent profiles that inherit the
model and reasoning-effort setting selected for the parent session.

Semantic audit work includes:

- discovering missing questions
- deciding question inclusion or exclusion
- interpreting transcript fragments
- choosing question wording
- writing or revising answer summaries
- resolving timestamps
- editing the question page

For semantic audit work:

- omit `model` and `model_reasoning_effort` from custom agent configuration
- do not select an agent profile that overrides or downgrades either setting
- keep all semantic decisions with an agent inheriting the parent settings

Mechanical helper work includes row counting, Markdown validation, link checking,
timestamp arithmetic, and repository checks. Mechanical helpers should also
inherit the parent settings by default. Use a different model or reasoning effort
only when the user explicitly requests that override.

## Sources

Use these in order:

1. Existing page: `docs/questions/<slug>-questions.md`
2. Working transcript: `src/transcripts/txt/<slug>.txt`
3. Source transcript: `src/transcripts/json/<slug>.json`
4. Stream routing index: `src/live-stream-list.md`
5. TSV only when exact seconds/links are hard to audit from TXT.

If TXT is missing and JSON exists, generate TXT with:

```powershell
pwsh -NoProfile -File scripts/Convert-TranscriptJson.ps1 src/transcripts/json/<slug>.json
```

If JSON is missing, or conversion says no transcript segments were found, stop for that page and report the blocker. Do not guess from the existing Markdown.

Special-purpose pages may not match the source slug exactly. Resolve the source stream from page headings, links, README references, `src/live-stream-list.md`,
or nearby transcript names.

## Audit Workflow

### 1. Route And Scan

Read the Markdown page first. Extract:

- source video ID from timestamp links
- current row timestamps and questions
- current question-row count
- table shape and obvious link problems

Use `src/live-stream-list.md` only to confirm uncertain title, slug, or video ID.

Do not read the full JSON unless TXT or TSV cannot answer the question.

### 2. Determine Coverage

Use **full coverage** by default for a general audit and whenever the task includes:

- finding missing questions
- checking page completeness
- repairing a page produced by a potentially low-recall first pass
- deciding whether the page needs further semantic inspection

Use **targeted coverage** only when the user names a narrow issue such as one
timestamp, one row, a known link problem, or formatting-only validation.

Full coverage means:

- inspect the working TXT transcript from beginning to end
- use contiguous bounded windows with overlap so no transcript range is skipped
- compare all audience-question turns against the existing page
- verify every existing row against its supporting transcript area

Targeted coverage means inspecting only the transcript areas needed for the
specified issue.

### 3. Search And Inspect Transcript Windows

Candidate searches are an accelerator, not proof of completeness:

```powershell
Select-String -Path src/transcripts/txt/FILE.txt -Pattern '\b(asks|asked|question|wants to know|super chat)\b|Next question|Next one|\?' -CaseSensitive:$false
```

Inspect bounded context around candidates:

```powershell
Get-Content src/transcripts/txt/FILE.txt | Select-Object -Skip START -First COUNT
```

For full coverage:

- inspect the TXT transcript sequentially in contiguous windows
- use a small overlap, usually 10-20 lines, between windows
- track the last inspected line or timestamp so coverage has no gaps
- use candidate results to prioritize attention, but never to skip unmatched ranges
- expand a window when needed to capture the complete question and its answer

For targeted coverage, start with the smallest relevant window and expand only
as needed.

### 4. Fix High-Confidence Issues

Make minimal edits to:

- add clearly missing real audience questions
- correct timestamps to the question start
- repair unsupported or overstated summaries
- complete truncated question wording
- split merged distinct questions or merge duplicates
- remove non-question housekeeping rows
- fix table, link, or pipe formatting

Preserve existing correct rows and useful human curation. Do not bulk-regenerate
unless the table is structurally unusable or the user explicitly asks.

### 5. Verify Rows

For full coverage:

- verify every retained, added, removed, merged, or split row against the transcript
- verify every timestamp points to the audience-question start
- verify each answer summary against the relevant answer span
- confirm the transcript was inspected from beginning to end without gaps

For targeted coverage, re-check changed and directly related rows only.

For every changed row, retain enough transcript context to explain the decision.

## Inclusion Rules

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

## Timestamp And Link Rules

Use the timestamp where the audience question begins, not the answer start.

Links must use `?t=` seconds and human-readable text:

```html
<a href="https://youtu.be/VIDEO_ID?t=543" target="_blank" rel="noopener noreferrer">9:03</a>
```

Convert precisely:

```text
9:03 -> 543
1:22:43 -> 4963
```

When TSV exists, prefer `StartSeconds` and generated links over hand conversion.

## Wording And Summary Rules

Question wording may be cleaned for readability, but stay conservative:

- remove filler only when meaning is unchanged
- combine split transcript fragments
- correct obvious transcript artifacts
- preserve names, titles, Bible references, Egyptian terms, dates, and chronology markers
- do not add context from the answer into the question

Short answers must be transcript-grounded:

- reflect what the speaker actually says
- preserve caveats and uncertainty
- stay short enough for table scanning
- avoid outside research

Use uncertainty when needed:

```text
The transcript does not give a clear direct answer.
```

## Table Format

Ordinary pages use:

```markdown
# Questions in Livestream 265

Live Stream #265: The Pharaoh of Swing

Time links open the YouTube video at the relevant timestamp.

| Time | Question | Short answer / answer direction |
|---:|---|---|
| <a href="https://youtu.be/VIDEO_ID?t=543" target="_blank" rel="noopener noreferrer">9:03</a> | Question text? | Short supported answer. |
```

Rules:

- one table row per line
- exactly three columns for ordinary pages
- timestamp link in column 1
- ordinary pages must use the exact column order `Time | Question | Short answer / answer direction`
- if an ordinary page uses another order such as `Question | Time | Answer`, normalize it to the standard order as part of the repair
- escape literal pipes inside cells as `\|`
- no raw newlines inside cells
- no placeholder links

Special-purpose pages may keep their existing adapted structure when supported. Transcript notes after the table are allowed if transcript-grounded and clearly
separate from Q&A rows.

## Validation

After edits, run targeted checks:

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
Select-String -Path $path -Pattern 'https://youtu\.be/[^"? ]+[" ]'
rg -n "\[Watch on YouTube\]|\[PLACEHOLDER\]|transcripts/livestreams/md|src/md" $path
git -c safe.directory=C:/Workspaces/ancient-egypt-and-the-bible diff --check -- $path
git -c safe.directory=C:/Workspaces/ancient-egypt-and-the-bible diff -- $path
```

Also verify display timestamps match `?t=` seconds for changed rows or when links were edited.
For ordinary pages, also verify the table header is exactly `| Time | Question | Short answer / answer direction |` and that every data row begins with a timestamp link.

## Output Modes

### Default Fix Mode

Return only:

```markdown
## Changes Made

- concise summary

## Validation

- checks run and result

## Remaining Uncertainties

- "None found" or important items only
```

Keep this short. Do not list every supported row or every candidate found.

### Audit-Only Mode

Only when explicitly requested, do not edit files. Return a compact report:

```markdown
## Audit Report

### Page

`docs/questions/FILE.md`

### Overall Status

PASS / NEEDS FIX / STRUCTURAL ISSUE

### Findings

- timestamp - issue - recommended fix

### Formatting And Link Issues

- issue list

### Recommended Repair Plan

1. highest-confidence fix
2. remaining uncertainty
```

## Batch Guidance

- Assign at most one semantic audit per file.
- When auditing multiple files in parallel, give each semantic subagent a distinct page and transcript.
- Semantic subagents should be read-only; the parent agent applies edits and appends the shared audit log serially.
- Every semantic subagent must inherit the parent session's model and reasoning effort.
- Do not treat candidate-search output as complete transcript coverage.

## Audit and Fix Tracking

Use `src/transcript-audit.log` as an append-only tracking record, not as transcript evidence.

### Before Editing

- Count the existing question data rows in the target page.
- Store the count as `question_count_before`.
- Count only actual question rows. Do not count the table header, separator row, or transcript notes.
- Do not read or use previous audit-log entries before independently evaluating the page against the transcript.

### After Editing And Validation

- Count the final question data rows as `question_count_after`.
- Calculate:

```text
question_count_change = question_count_after - question_count_before
```

- Confirm that the recorded counts and change agree.
- After the independent audit is complete, search only for existing log entries matching the target filename when prior history may help identify unresolved
  concerns or compare earlier work.
- Treat previous audit entries as clues and history, not as proof that a row, answer, or timestamp is correct.
- Do not read or summarize the entire audit log merely to process one page.
- Append exactly one new record. Preserve all existing records without rewriting or normalizing them.
- Do not add or infer an `audit_pass` number. The existing log does not guarantee a complete audit sequence.

Record:

- ISO 8601 full local timestamp
- audited file short name and extension
- semantic audit model
- semantic audit reasoning effort
- `coverage=full` or `coverage=targeted`
- `question_count_before`
- `question_count_after`
- `question_count_change`, including `+` for positive changes
- whether the file could use further inspection
- a concise note describing important changes or remaining uncertainty

For model and effort fields:

- record runtime-reported values when available
- otherwise record the parent session's selected values because semantic agents are required to inherit them
- if a value cannot be determined, record `unknown`
- do not record a mechanical helper's model or effort as the semantic audit model or effort
- do not guess a model name from behavior or output quality

Example shape; replace placeholders with the actual values:

```text
2026-06-21T12:34:56-05:00 108-the-many-views-of-heck-questions.md; model=MODEL_NAME; effort=EFFORT_LEVEL; coverage=full; question_count_before=6; question_count_after=31; question_count_change=+25; could_use_further_inspection=no; added high-confidence missing questions and validated retained rows and timestamps.
```

Existing records in older formats may remain unchanged.

## Done Checklist

Finish only when relevant items are true:

- retained and added questions are transcript-supported
- timestamps point to question starts
- `?t=` seconds match display timestamps
- timestamp links include `target="_blank"` and `rel="noopener noreferrer"`
- short answers are supported and preserve uncertainty
- no outside facts were added
- table rows render cleanly
- no placeholder or legacy links remain
- `question_count_before`, `question_count_after`, and `question_count_change` agree
- full-coverage audits inspected the TXT transcript from beginning to end without gaps
- targeted audits were limited only because the user requested or identified a narrow scope
- the audit log was appended only after independent page analysis and validation
- the recorded `coverage` value matches the work actually performed
- diff was reviewed
- final response is minimal unless audit-only was requested
