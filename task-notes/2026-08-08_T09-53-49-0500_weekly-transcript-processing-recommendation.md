# Weekly Transcript Processing Recommendation

Timestamp: 2026-08-08T09:53:49-05:00

## Recommendation

Replace the fixed two-to-three-audit routine with one required full audit plus conditional follow-up work.

Both `transcript-to-md-reference` and a general `transcript-question-page-audit` perform full transcript coverage and row-by-row verification. The current routine therefore produces three or four complete semantic transcript passes:

- one first-pass creation
- two or three full audits

The recommended routine uses two complete semantic passes and should reduce transcript-level AI processing by roughly 33-50 percent while preserving a separate quality-control pass.

## Revised Weekly Workflow

1. Run `npm run fetch:livestreams`.
2. Run `npm run fetch:transcripts`.
3. Run `src/transcripts/txt/<new-transcript>.txt` through `$transcript-to-md-reference` once.
4. Run the resulting page through `$transcript-question-page-audit` once with this request:

   ```text
   docs/questions/<new-transcript>.md use $transcript-question-page-audit find and fix issues with complete transcript-grounded validation, full transcript coverage, and final direct-answer wording cleanup
   ```

5. Stop AI processing when the audit reports all of the following:

   - `coverage=full`
   - `could_use_further_inspection=no`
   - `expanded_answers_pending=0`
   - validation passed

6. Run `npm run check`.
7. Review the diff, commit, and push.

`npm run check` reaches `check:site:static`, which invokes the site-content builder before validating generated content. When using `npm run check`, a separate `npm run build:site-content` invocation is redundant.

## Conditional Follow-Up Rules

Run another AI pass only when there is a specific trigger:

- the audit records `could_use_further_inspection=yes`
- full transcript coverage was not completed
- a named timestamp, ambiguous proper noun, or answer remains unresolved
- the audit exposes unusually broad low-recall or structural problems

Prefer targeted coverage for a named issue. If uncertainty comes from garbled captions and requires audio verification, another complete TXT audit is unlikely to resolve it.

Do not run a third general full audit unless a prior pass explicitly failed, remained incomplete, or identified broad unresolved uncertainty.

## Recent Evidence

- Episode 272: first-pass creation produced 65 rows; the first audit added five questions; the second full audit found no further high-confidence edits.
- Episode 273: first-pass creation produced 61 rows; the first audit made no content changes; the second full audit only revised answer wording. That wording check should instead be included in the first audit request or handled as a targeted wording pass.

One separate full audit remains worthwhile because the Episode 272 result shows that first-pass creation can miss material questions. Unconditional second and third audits show diminishing returns for new weekly pages created under the current full-coverage skill.

## Scope Caveat

This stopping rule is for newly created weekly pages using the current skill contract. Older or legacy pages may warrant additional full audits because earlier page baselines and historical first passes sometimes had materially lower question recall.

Keep creation and audit sequential for a single page. Parallel processing of the same page would not reduce total semantic work and could introduce conflicting edits.
