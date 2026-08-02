---
name: transcript-question-page-audit
description: Find and fix issues in existing Ancient Egypt and the Bible Q&A Markdown pages under docs/questions against transcript sources. Use for page-scoped correction passes covering missing questions, timestamps, answer support, four-column tables, and links. Do not use for first-pass page creation.
---

# Transcript Question Page Audit

## Default Behavior

Default to **find and fix**. Keep page completeness, transcript support, and validation independent of closeout length.

- Edit the target page when the user asks to audit, check, repair, fix, correct, update, or improve it.
- Treat missing, placeholder, duplicated, unsupported, or stale expanded answers as audit issues on ordinary pages.
- Do not return a long audit report unless the user explicitly asks for "audit-only", "report only", "do not edit", or "review only".
- In the final response, retain every material change, check, blocker, and uncertainty; trim introductions, repetition, and optional background first.
- Prefer high-confidence fixes over speculative edits.
- For missing-question or completeness audits, inspect the entire working transcript; high confidence limits what is changed, not how much of the transcript is covered.
- Do not invent transcript content or outside facts.

Use `transcript-to-md-reference` instead for first-pass page creation.

## Sources

Use these in order:

1. Existing page: `docs/questions/<slug>-questions.md`
2. Canonical identity and path: `src/channel/episodes.json` and `src/transcripts/manifest.json`
3. Source transcript: `src/transcripts/txt/<fileStem>.txt`

If an expected TXT is missing, validate the store and use direct acquisition only when authorized:

```powershell
npm run check:transcript-store
npm run fetch:transcript -- --video-id VIDEO_ID
```

If the manifest is invalid, the TXT is missing, or acquisition reports no caption segments, stop for that page and report the blocker. Do not guess from the existing Markdown. Legacy JSON is optional historical evidence while retained, not a prerequisite or active source.

Special-purpose pages may not match the source slug exactly. Resolve the source stream from page headings, links, README references, `src/channel/episodes.json`, or nearby transcript names.

## Audit Workflow

### 1. Route And Scan

Read the Markdown page first. Extract:

- source video ID from timestamp links
- current row timestamps and questions
- current question-row count
- table shape and obvious link problems

Use `src/channel/episodes.json` to confirm uncertain title, slug, or video ID.

Do not require legacy JSON or create tracked TSV diagnostics. The canonical TXT should answer page-scoped audit questions; put exceptional diagnostics under ignored `reports/`.

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
- repair missing, placeholder, or deferred expanded answers
- revise expanded answers when they are unsupported, too thin or over-compressed to be useful, duplicated from the short answer, contradicted by the short answer, or stale after a row change
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
- verify each expanded answer against the relevant answer span and confirm it adds detail beyond the short answer without omitting material reasoning, examples, qualifications, or distinctions
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

Convert the canonical TXT display timestamp precisely to seconds for links.

## Wording And Summary Rules

Question wording should create direct, searchable questions:

- write direct questions, not transcript fragments or topic labels
- preserve the user's wording when it helps specificity or searchability
- remove filler, false starts, and repeated setup when meaning is unchanged
- combine split transcript fragments and correct obvious transcript artifacts
- keep names, titles, Bible references, Egyptian terms, dates, and chronology markers searchable
- do not add context from the answer into the question

Short answers should be concise and search-friendly. Expanded answers should be readable, developed, and third-person:

- keep short answers concise; let expanded answers use the wording needed to explain the transcript-supported answer fully
- reflect what the host actually says
- preserve caveats, uncertainty, disagreement, and limits
- avoid outside research
- make routine answer cells answer-shaped, not report-shaped: prefer `Pyramids were resurrection machines...` over `The host described pyramids as...`
- use `docs/questions/266-three-major-questions-questions.md` as the style model for direct answer phrasing: `The Greek term means...`, `Wine was already present...`, and `The ark's danger is tied...`
- do not mechanically replace "He said" with "The host said"; if attribution is unnecessary, remove the attribution frame entirely
- avoid routine openings such as "He said," "He says," "He rejects," "He argued," "He explained," "The host said," "The host argued," or "The host explained"
- use attribution only when it carries necessary meaning, such as the host's interpretation, uncertainty, disagreement, stated opinion, personal preference, or personal experience
- keep compact attribution for personal status or preference when direct phrasing would blur the source: `He had not heard of it`, `He would rather...`, or `In his account...`
- prefer compact phrasing for short answers; keep expanded answers focused without forcing them into short-answer length

Expanded answers:

- are required for ordinary pages unless the user explicitly asks not to populate them
- must be transcript-grounded, useful as a standalone explanation, and more detailed than the short answer
- must not contradict the short answer
- have no fixed word or sentence limit; use several sentences when the source answer needs them
- should favor completeness over compression for the main reasoning, sequence, material examples, qualifications, caveats, and distinctions
- should retain useful transcript-supported detail from an existing answer rather than shortening it merely for concision
- should preserve the host's caveats, uncertainty, and limits rather than smoothing them away
- should add transcript-supported detail such as reasoning, examples, qualifications, and distinctions that help a reader understand the answer without rewatching the segment
- should remain focused: do not add repeated conclusions, irrelevant tangents, transcript filler, or wording that does not improve understanding
- should be updated whenever the short answer, question wording, timestamp, split/merge decision, or supporting transcript window changes
- must not leave `_Expansion pending._` on ordinary pages under the filled-answer baseline
- when transcript support is limited, write a limited expanded answer that preserves uncertainty, or correct/remove the row if the question or answer is unsupported
- may leave `_Expansion pending._` only when the user explicitly asks to defer that row, and must note that strict table validation will fail until the placeholder is resolved

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

| Time | Question | Short answer / answer direction | Expanded answer |
|---:|---|---|---|
| <a href="https://youtu.be/VIDEO_ID?t=543" target="_blank" rel="noopener noreferrer">9:03</a> | Question text? | Short supported answer. | Expanded transcript-grounded answer with the main reasoning, caveats, and examples. |
```

Rules:

- one table row per line
- exactly four columns for ordinary pages
- timestamp link in column 1
- ordinary pages must use the exact column order `Time | Question | Short answer / answer direction | Expanded answer`
- if an ordinary page uses another order such as `Question | Time | Answer`, normalize it to the standard order as part of the repair
- if an ordinary page still uses the legacy three-column order, add the `Expanded answer` column and populate transcript-grounded expanded answers for retained and added rows
- escape literal pipes inside cells as `\|`
- no raw newlines inside cells
- no placeholder links
- `_Expansion pending._` is not allowed on ordinary pages unless the user explicitly asks to defer that row

Special-purpose pages may keep their existing adapted structure when supported. Transcript notes after the table are allowed if transcript-grounded and clearly
separate from Q&A rows.

## Validation

After edits, run targeted checks. For ordinary pages, prefer the repo validator,
which requires four-column rows and populated expanded answers by default:

```powershell
npm run check:question-tables
```

For a narrow single-file pass, or when the full corpus validator is too noisy or
slow for the current task, scope the same validator to the target file:

```powershell
npm run check:question-tables -- --path docs/questions/FILE.md
```

The validator's table-analysis implementation is `src/questions/table-analysis.ts`.
If the scoped validator is unavailable in an older checkout, run these
local checks against the target file:

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
Select-String -Path $path -Pattern 'https://youtu\.be/[^"? ]+[" ]'
rg -n "\[Watch on YouTube\]|\[PLACEHOLDER\]|transcripts/livestreams/md|src/md" $path
rg -n "_Expansion pending\\._" $path
git -c safe.directory=C:/Workspaces/ancient-egypt-and-the-bible diff --check -- $path
git -c safe.directory=C:/Workspaces/ancient-egypt-and-the-bible diff -- $path
```

Also verify display timestamps match `?t=` seconds for changed rows or when links were edited.
For ordinary pages, also verify the table header is exactly `| Time | Question | Short answer / answer direction | Expanded answer |`, that every data row begins with a timestamp link, and that every expanded-answer cell is non-empty, transcript-grounded text. Treat any remaining `_Expansion pending._` row as an explicit deferral or blocker; strict table validation will fail until it is resolved. Do not treat a passing structural validator as proof that expanded-answer prose is transcript-supported; semantic support still requires transcript inspection.

## Final Response

Lead with the result. For completed change tasks, use the repo's compact closeout shape when it fits:

- Changed:
- Files:
- Checked:
- Notes:

Mention every material blocker or uncertainty. Do not list every transcript candidate or unchanged row unless the user asked for a report.

## Batch Guidance

- Assign at most one semantic audit per file.
- When auditing multiple files in parallel, give each semantic subagent a distinct page and transcript.
- Semantic subagents should be read-only; the parent agent applies edits and appends the shared audit log serially.
- Do not treat candidate-search output as complete transcript coverage.

## Audit Log

Use `src/transcript-audit.log` as an append-only tracking record, not as transcript evidence.

Before editing, count actual question rows as `question_count_before`. After editing and validation, count final question rows as `question_count_after` and calculate:

```text
question_count_change = question_count_after - question_count_before
```

Confirm the recorded counts agree. Do not read or summarize the whole log before auditing. After the independent audit, search only for target-file records if prior history may clarify unresolved concerns.

Append exactly one new record after validation. Preserve existing records without rewriting, sorting, or normalizing them. Do not add or infer an `audit_pass` number.

Record:

- ISO 8601 full local timestamp
- audited file short name and extension
- `coverage=full` or `coverage=targeted`
- `question_count_before`
- `question_count_after`
- `question_count_change`, including `+` for positive changes
- whether the file could use further inspection
- `expanded_answers_pending=0` for ordinary pages, or the exact pending count plus explicit deferral/blocker reason if the user chose to leave a placeholder unresolved
- a concise note describing important changes or remaining uncertainty

Example shape; replace placeholders with the actual values:

```text
2026-06-21T12:34:56-05:00 108-the-many-views-of-heck-questions.md; coverage=full; question_count_before=6; question_count_after=31; question_count_change=+25; could_use_further_inspection=no; expanded_answers_pending=0; added high-confidence missing questions and validated retained rows, timestamps, and expanded answers.
```

## Done Checklist

Finish only when relevant items are true:

- retained and added questions are transcript-supported
- retained and added questions are written as direct, searchable questions
- timestamps point to question starts
- `?t=` seconds match display timestamps
- timestamp links include `target="_blank"` and `rel="noopener noreferrer"`
- short answers are supported and preserve uncertainty
- short answers use concise third-person phrasing; expanded answers use readable third-person prose with enough room for material transcript detail; neither uses report-shaped routine attribution or merely replaces "He said" with "The host said"
- expanded answers are populated, transcript-supported, sufficiently developed for the source answer, consistent with short answers, and preserve uncertainty
- no `_Expansion pending._` cells remain unless the user explicitly deferred them and the final output/audit log records the blocker
- no outside facts were added
- table rows render cleanly
- no placeholder links or legacy links remain
- `question_count_before`, `question_count_after`, and `question_count_change` agree
- full-coverage audits inspected the TXT transcript from beginning to end without gaps
- targeted audits were limited only because the user requested or identified a narrow scope
- the audit log was appended only after independent page analysis and validation
- the recorded `coverage` value matches the work actually performed
- diff was reviewed
- final response retains all material changes, checks, blockers, and uncertainty without optional transcript-by-transcript detail
