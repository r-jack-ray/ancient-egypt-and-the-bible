# Two-Tier Answer Migration Pre-Plan for Codex

## Purpose

Plan a repository-wide migration from a single short-answer column in `docs/questions/*.md` to a two-tier answer model:

1. **Short answer / answer direction** — compact scan-friendly answer.
2. **Expanded answer** — fuller transcript-grounded answer, initially filled with a placeholder until each episode can be reviewed and expanded.

This is a planning document for Codex. It is not an execution prompt by itself.

## Recommended Branch / Worktree Strategy

### Recommendation

Use a dedicated feature branch and enable worktrees if Codex will work on multiple parts of the migration in parallel.

Suggested base branch:

```text
feature/two-tier-answers
```

Suggested worktrees or sub-branches:

```text
feature/two-tier-answers-format
feature/two-tier-answers-hugo
feature/two-tier-answers-skills
feature/two-tier-answers-validation
```

### Why worktrees make sense here

This migration touches several mostly independent areas:

- source Markdown format under `docs/questions`
- migration and validation scripts
- Hugo generator logic
- Hugo layouts and search UI
- Hugo tests
- Codex skill files
- documentation and status reports

Worktrees reduce accidental cross-contamination between these tasks. They are especially useful if more than one Codex thread or agent is active.

### Worktree caution

Do not let multiple worktrees edit the same files at the same time unless the scope is intentionally narrow. For example:

- One worktree can update `docs/questions` migration scripts.
- Another can update Hugo parsing/layout/search code.
- Another can update `.codex/skills`.

Avoid having two worktrees both modify the same Hugo script or the same skill file unless one is explicitly experimental.

## Current Format Assumption

Most ordinary episode files currently use a three-column Q&A table:

```markdown
| Time | Question | Short answer / answer direction |
|---:|---|---|
| <a href="..." target="_blank" rel="noopener noreferrer">9:03</a> | Question text? | Short answer text. |
```

## Target Markdown Format

Ordinary episode files should use a four-column Q&A table:

```markdown
| Time | Question | Short answer / answer direction | Expanded answer |
|---:|---|---|---|
| <a href="..." target="_blank" rel="noopener noreferrer">9:03</a> | Question text? | Short scan-friendly answer. | _Expansion pending._ |
```

## Placeholder Standard

Use this exact placeholder in the new fourth column:

```markdown
_Expansion pending._
```

Reasons:

- It is human-readable.
- It is easy to search.
- It distinguishes intentional pending work from broken or empty table cells.
- It allows progress reporting.

Do not use an empty fourth cell for pending expansion.

## Migration Goals

### Primary goals

- Preserve every existing timestamp link.
- Preserve every existing question.
- Preserve every existing short answer.
- Add a fourth `Expanded answer` column to ordinary Q&A tables.
- Fill new expanded-answer cells with `_Expansion pending._`.
- Keep Hugo search and page rendering functional during the transition.
- Update Codex creation and audit skills so new files use the four-column format.

### Non-goals for the first migration pass

- Do not expand all answers immediately.
- Do not rewrite existing short answers unless they are mechanically damaged by migration.
- Do not change timestamp URL format.
- Do not reorganize episode files.
- Do not combine this with unrelated Hugo visual redesign.

## Proposed Implementation Order

### Phase 1 — Baseline and discovery

Tasks:

1. Count all Markdown files under `docs/questions`.
2. Classify files by table format:
   - ordinary three-column Q&A table
   - already migrated four-column Q&A table
   - special/adapted format
   - malformed or suspicious table
3. Generate a report before changing anything.

Output example:

```text
reports/two-tier-answer-precheck.json
reports/two-tier-answer-precheck.md
```

Recommended report fields:

```json
{
  "filesScanned": 0,
  "ordinaryThreeColumn": 0,
  "ordinaryFourColumn": 0,
  "specialFormat": 0,
  "malformed": 0,
  "totalQuestionRows": 0,
  "notes": []
}
```

Acceptance criteria:

- The precheck report lists every skipped or suspicious file.
- No files are modified during this phase.

### Phase 2 — Add validator

Create or update a validation script that checks ordinary Q&A files.

Validator should check:

- ordinary Q&A tables have the expected column count
- header row is recognized
- divider row exists
- each data row has a stable column count
- timestamp cell contains an `<a href="...">...</a>` link
- no placeholder or broken timestamp links are introduced
- escaped pipe handling does not split table cells incorrectly
- fourth column exists after migration
- fourth column is either `_Expansion pending._` or non-empty expanded answer text

Useful warnings:

- expanded answer identical to short answer
- expanded answer shorter than short answer but not pending
- empty expanded-answer cell
- row count changed unexpectedly from previous report

Acceptance criteria:

- Validator can run before and after migration.
- Validator exits non-zero when hard table errors are found.
- Validator emits a readable report.

### Phase 3 — Add one-time migration script

Create a script that converts ordinary three-column episode Q&A tables to four-column tables.

Required behavior:

- Process `docs/questions/*.md`.
- Detect the ordinary three-column table header.
- Add `Expanded answer` as the fourth header.
- Add a fourth divider cell.
- Add `_Expansion pending._` to each ordinary data row.
- Preserve existing cell text exactly where possible.
- Preserve timestamp links exactly.
- Preserve file ordering and line endings where practical.
- Skip already-migrated four-column files.
- Skip special/adapted pages unless explicitly supported.
- Emit a migration report.

Recommended script name options:

```text
scripts/Add-ExpandedAnswerColumn.ps1
scripts/add-expanded-answer-column.py
```

PowerShell is reasonable because the repository already uses PowerShell for project scripts, but Python may be safer if robust Markdown table parsing is needed.

Acceptance criteria:

- Running the script twice is safe and does not duplicate the column.
- Migration does not change question row count.
- Migration report shows changed, skipped, and suspicious files.
- Git diff is mostly mechanical.

### Phase 4 — Trial migration on a tiny sample

Before changing every file:

1. Copy or select 2–3 representative episode files.
2. Include at least one normal file and one edge-case file.
3. Run the migration script only on those files.
4. Run validator.
5. Run Hugo generator and Hugo test script.
6. Inspect the rendered search/page output manually.

Acceptance criteria:

- Sample output renders correctly in Markdown.
- Hugo pages still build.
- Search results still show short answers.
- Expanded-answer placeholder can be displayed or hidden cleanly.

### Phase 5 — Update Hugo generator

Update the Hugo generator script to understand both old and new table formats during transition.

Temporary compatibility behavior:

```text
3-column row -> answerShort populated; answerExpanded null or _Expansion pending._
4-column row -> answerShort and answerExpanded populated
```

Long-term behavior:

```text
4-column row required for ordinary Q&A files
3-column row treated as legacy warning or validation failure
```

Recommended generated data shape:

```json
{
  "episodeTitle": "Example Episode",
  "episodeNumber": "123",
  "time": "9:03",
  "url": "https://www.youtube.com/watch?v=...&t=543s",
  "question": "Question text?",
  "answerShort": "Short answer text.",
  "answerExpanded": "_Expansion pending._"
}
```

Acceptance criteria:

- Hugo generation works with migrated files.
- Existing search index output remains valid JSON.
- Expanded answers are available to layout/search code.
- Placeholder expanded answers are recognizable.

### Phase 6 — Update Hugo search behavior

Search result display should remain compact by default.

Recommended result layout:

```text
Question
Episode title + timestamp
Short answer
[Show expanded answer]
```

Behavior options:

1. Always collapse expanded answer by default.
2. Auto-expand if the matched term appears only in `answerExpanded`.
3. Hide `_Expansion pending._` unless a debug/status mode is enabled.

Search weighting suggestion:

```text
question: high
aliases: high
answerShort: medium
expandedAnswer: low
episodeTitle: low/medium
```

Rationale:

- The question and short answer should drive normal result ranking.
- Expanded answers should improve recall without overpowering the direct Q&A terms.

Acceptance criteria:

- Main search results remain scan-friendly.
- Expanded answers do not flood the result list.
- Query terms found in expanded answers can still surface relevant results.
- Search remains fast enough with the larger data field.

### Phase 7 — Update Hugo layout

Update relevant Hugo templates and partials so full question pages can display both answer tiers.

Recommended rendered page behavior:

- Show `Short answer / answer direction` in the table.
- Show `Expanded answer` either as another table column or as expandable detail below each row.

Layout decision to make with Codex:

```text
Option A: keep Expanded answer as a fourth visible table column
Option B: render Expanded answer as collapsible row detail
Option C: keep Markdown table source format, but transform into richer HTML in Hugo
```

Suggested preference:

Use the fourth Markdown column as source format, but render expanded answers as collapsible detail in Hugo if the table becomes too wide.

Acceptance criteria:

- Desktop layout is readable.
- Mobile layout does not become unusable.
- Timestamp links remain easy to click.
- Pending placeholders are either hidden or clearly marked as pending.

### Phase 8 — Update Hugo tests

Add or update tests for:

- three-column legacy parsing during transition
- four-column parsing
- pending expanded answer placeholder
- real expanded answer content
- escaped pipes inside cells
- timestamp link preservation
- generated JSON fields
- MiniSearch index fields
- search result rendering with collapsed expanded answer
- search result rendering when expanded answer matches query

Acceptance criteria:

- Tests fail if `Expanded answer` is dropped.
- Tests fail if row count changes unexpectedly.
- Tests fail if generated search JSON lacks expected fields.

### Phase 9 — Migrate all episode files

Once sample migration and Hugo changes are proven:

1. Run migration script across `docs/questions`.
2. Run validator.
3. Run Hugo generator.
4. Run Hugo test script.
5. Review Git diff by category:
   - source Markdown tables
   - generated Hugo/search data
   - scripts/tests
   - skills/docs

Acceptance criteria:

- All ordinary Q&A files use four columns.
- No question rows are lost.
- No timestamp links are broken.
- Reports show expected pending expansion count.

### Phase 10 — Update Codex creation skill

Update `.codex/skills/transcript-to-md-reference/SKILL.md`.

New ordinary table requirement:

```markdown
| Time | Question | Short answer / answer direction | Expanded answer |
|---:|---|---|---|
```

Recommended creation behavior:

- Fill `Short answer / answer direction` with the normal concise answer.
- Fill `Expanded answer` with `_Expansion pending._` unless the user explicitly requests expanded answers during creation.
- Preserve timestamp link requirements.
- Preserve existing table hygiene rules.
- Add explicit instruction that the fourth column is required for ordinary Q&A pages.

Acceptance criteria:

- New Codex-created episode files use the four-column format.
- Skill does not encourage long expanded answers during first-pass extraction unless requested.

### Phase 11 — Update Codex audit skill

Update `.codex/skills/transcript-question-page-audit/SKILL.md`.

Audit rules to add:

- Validate both answer tiers against the transcript.
- Short answer must remain concise and scan-friendly.
- Expanded answer may include fuller transcript-grounded explanation.
- Expanded answer must not contradict the short answer.
- `_Expansion pending._` is allowed and is not an audit failure.
- If the short answer is factually corrected, update the expanded answer too if it is not pending.
- Preserve row count unless the transcript audit finds missing, duplicate, or invalid questions.

Acceptance criteria:

- Audit skill understands four-column ordinary Q&A tables.
- Audit skill does not treat pending expansions as failures.
- Audit skill reports pending expansion count separately from factual audit issues.

### Phase 12 — Consider a dedicated expansion skill or prompt

A separate expansion workflow is recommended.

Possible skill name:

```text
transcript-question-answer-expansion
```

Purpose:

- Fill `_Expansion pending._` cells after the file has already passed question/audit review.
- Use the transcript only.
- Preserve timestamp links, questions, short answers, and row order.
- Do not add or remove rows unless explicitly asked.
- Report number of expanded answers completed.
- Report any rows that could not be expanded confidently.

Acceptance criteria:

- Expansion work is separated from extraction and audit work.
- Lower risk of audit drift.
- Progress can be tracked by counting remaining placeholders.

## Suggested Expansion Rules

Expanded answers should be:

- grounded in the transcript
- 1–3 sentences by default
- longer only when the transcript answer genuinely requires nuance
- consistent with the short answer
- free of outside research unless the project explicitly allows it
- written for search usefulness without keyword stuffing

Expanded answers should not:

- invent details not present in the transcript
- turn uncertain transcript discussion into a firm conclusion
- contradict the short answer
- merely repeat the short answer word-for-word
- become commentary from Codex

## Status Reporting

Add a status report that can be regenerated at any time.

Possible output:

```text
reports/answer-expansion-status.md
reports/answer-expansion-status.json
```

Suggested fields:

```json
{
  "filesScanned": 0,
  "totalQuestionRows": 0,
  "expandedPending": 0,
  "expandedComplete": 0,
  "emptyExpandedCells": 0,
  "malformedRows": 0,
  "filesWithPendingExpansions": []
}
```

Useful derived values:

```text
percentExpanded = expandedComplete / totalQuestionRows
percentPending = expandedPending / totalQuestionRows
```

## Risk Register

### Risk: Markdown table parsing breaks on pipes inside answers

Mitigation:

- Preserve escaped pipes.
- Add validator checks.
- Test against files with unusual punctuation or links.

### Risk: Hugo search index becomes too large

Mitigation:

- Keep short answers in the main ranking fields.
- Give expanded answers lower search weight.
- Consider lazy-loading expanded answers later if needed.

### Risk: Expanded answers overpower search relevance

Mitigation:

- Weight `question`, aliases, and short answer higher than expanded answer.
- Add query regression tests.

### Risk: Codex changes row counts during expansion

Mitigation:

- Separate expansion from audit.
- Require row-count preservation in the expansion prompt/skill.
- Run validator after every batch.

### Risk: Pending placeholders appear publicly in an ugly way

Mitigation:

- Hugo layout can hide `_Expansion pending._` by default.
- Search results can omit expanded-answer UI when expansion is pending.

### Risk: Worktrees cause merge conflicts

Mitigation:

- Assign non-overlapping file areas to each worktree.
- Merge scripts/tests before running full migration.
- Avoid concurrent edits to the same skill files or Hugo files.

## Suggested Codex Planning Prompt

Use this after Codex has access to the repository:

```text
Review this repository and create an implementation plan for migrating docs/questions episode Markdown files from the current ordinary three-column Q&A table format to a four-column format with an added Expanded answer column.

Use this planning document as guidance, but do not execute changes yet.

Focus on:
1. identifying every script, Hugo layout, test, data file, and Codex skill likely affected;
2. recommending whether the migration should be split across branches or worktrees;
3. proposing a safe implementation order;
4. identifying validation checks needed before and after migration;
5. identifying any current code that assumes exactly three Q&A table columns;
6. proposing minimal changes needed to support the new format without breaking existing Hugo search.

Do not modify files in this pass. Produce a concise implementation plan and list any questions or risks that need confirmation.
```

## Suggested Codex Execution Prompt After Planning

Use only after reviewing the Codex plan:

```text
Implement Phase 1 and Phase 2 only:

1. Add a precheck/report script that scans docs/questions Markdown files and classifies table formats.
2. Add or update a validator for ordinary Q&A table structure.
3. Do not migrate all files yet.
4. Do not change Hugo layout or Codex skills yet.
5. Produce reports showing current table format status and any suspicious files.
6. Keep changes focused and reviewable.
```

## Recommended First Commit Boundaries

Commit 1:

```text
Add two-tier answer migration precheck and validator
```

Commit 2:

```text
Add expanded-answer column migration script
```

Commit 3:

```text
Support expanded answers in Hugo generation and tests
```

Commit 4:

```text
Update Hugo layout and search display for expanded answers
```

Commit 5:

```text
Migrate question Markdown files to expanded-answer format
```

Commit 6:

```text
Update Codex transcript creation and audit skills for expanded answers
```

Commit 7, optional:

```text
Add transcript-grounded answer expansion workflow
```

## Final Acceptance Criteria

The migration is complete when:

- ordinary `docs/questions/*.md` files use the four-column format
- existing timestamps, questions, and short answers are preserved
- every row has a valid expanded-answer cell
- pending expanded answers use `_Expansion pending._`
- Hugo generation succeeds
- Hugo tests pass
- search still works and remains readable
- expanded answers are available to Hugo/search without dominating relevance
- create and audit Codex skills require or understand the new format
- a status report can show remaining pending expansions

## Decision Needed Before Execution

1. Should expanded answers be visible as a fourth table column in rendered pages, or collapsed beneath each row?
2. Should `_Expansion pending._` be visible publicly, hidden, or shown only in debug/status views?
3. Should expanded answers be indexed immediately, or added to the index only after real expansions replace placeholders?
4. Should expansion be handled by the audit skill or by a separate expansion skill?
5. Should legacy three-column parsing remain permanently, or only during migration?

## Preferred Decisions

Recommended defaults:

1. Source Markdown uses a fourth column.
2. Hugo renders expanded answers as collapsible details where practical.
3. Pending placeholders are hidden from normal public display.
4. Expanded answers are indexed with low weight after real content exists.
5. Expansion gets a separate skill or separate explicit Codex mode.
6. Legacy three-column parsing is temporary and later becomes a validator warning or failure.
7. Worktrees are enabled for parallel Codex planning or implementation, but each worktree gets a non-overlapping file scope.
