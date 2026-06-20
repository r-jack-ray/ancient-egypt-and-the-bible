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
- Prefer high-confidence fixes over exhaustive reporting.
- Do not invent transcript content or outside facts.

Use `transcript-to-md-reference` instead for first-pass page creation.

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

Special-purpose pages may not match the source slug exactly. Resolve the source stream from page headings, links, README references, `src/live-stream-list.md`, or nearby transcript names.

## Cost-Controlled Workflow

### 1. Route And Scan

Read the Markdown page first. Extract:

- source video ID from timestamp links
- current row timestamps/questions
- table shape and obvious link problems

Use `src/live-stream-list.md` only to confirm uncertain title, slug, or video ID.

Do not read the full JSON unless TXT/TSV cannot answer the question.

### 2. Cheap Transcript Candidate Search

Start with compact candidate searches rather than reading the whole transcript:

```powershell
Select-String -Path src/transcripts/txt/FILE.txt -Pattern '\b(asks|asked|goes|says)\b|Next question|Next one|super chat|\?' -CaseSensitive:$false
```

Then inspect bounded context only around candidates:

```powershell
Get-Content src/transcripts/txt/FILE.txt | Select-Object -Skip START -First COUNT
```

Use small windows first, usually 8-25 lines. Expand only when needed to finish the question or support the answer summary.

For long transcripts, make one compact candidate list and compare it to current page rows before doing deep semantic checks.

### 3. Fix High-Confidence Issues

Make minimal edits to:

- add clearly missing real audience questions
- correct timestamps to the question start
- repair unsupported or overstated summaries
- complete truncated question wording
- split merged distinct questions or merge duplicates
- remove non-question housekeeping rows
- fix table, link, or pipe formatting

Preserve existing correct rows and useful human curation. Do not bulk-regenerate unless the table is structurally unusable or the user explicitly asks.

### 4. Verify Changed Rows

For every changed row, know the supporting transcript timestamp or segment. Re-check only changed or suspicious rows unless the user asks for exhaustive review.

Full row-by-row verification is optional and should be reserved for small pages, severe quality issues, or explicit exhaustive-audit requests.

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
- escape literal pipes inside cells as `\|`
- no raw newlines inside cells
- no placeholder links

Special-purpose pages may keep their existing adapted structure when supported. Transcript notes after the table are allowed if transcript-grounded and clearly separate from Q&A rows.

## Validation

After edits, run targeted checks:

```powershell
$path = "docs/questions/FILE.md"
Get-Content $path | Where-Object { $_ -match '^\|' } | ForEach-Object {
    $line = $_
    $unescaped = ([regex]::Matches($line, '(?<!\\)\|')).Count
    if ($unescaped -ne 4) { [pscustomobject]@{ Pipes = $unescaped; Line = $line } }
}
Select-String -Path $path -Pattern 'https://youtu\.be/[^"? ]+[" ]'
rg -n "\[Watch on YouTube\]|\[PLACEHOLDER\]|transcripts/livestreams/md|src/md" $path
git -c safe.directory=C:/Workspaces/ancient-egypt-and-the-bible diff --check -- $path
git -c safe.directory=C:/Workspaces/ancient-egypt-and-the-bible diff -- $path
```

Also verify display timestamps match `?t=` seconds for changed rows or when links were edited.

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

- For multiple files, prefer fixing one file at a time unless the task is purely mechanical.
- Use read-only subagents only for batch audits; main agent applies edits.
- Avoid loading full transcripts for every file. Use candidate searches first.

## Audit and Fix Tracking
- create or update an audit log in src/transcript-audit.log Log ISO 8601 full local time, audited file short name and extension, AI model and effort level used, question count change +/-, note if the audited file could use further inspection.

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
- diff was reviewed
- final response is minimal unless audit-only was requested
