# Editor Skill Call Styles

These are reusable prompt patterns for calling the transcript question page audit/editor skill. Replace `docs/questions/<file>.md` with the project-root-relative page path.

## Fast Wording-Only Pass

Use this when the goal is only to reduce routine attribution such as "He said," "He argued," or "He explained."

```text
docs/questions/<file>.md use $transcript-question-page-audit wording-only pass: remove routine "He said", "He argued", and "He explained" openings from short and expanded answers where meaning stays the same. Preserve row count, timestamps, questions, links, transcript meaning, caveats, and expanded-answer support. No missing-question audit. Do not update src/transcript-audit.log because this is only a wording change.
```

Use low or medium effort for this when the page already had a recent full audit.

## Targeted Wording Pass With Transcript Checks

Use this when wording should be cleaned up, but affected rows may need spot-checking against the transcript.

```text
docs/questions/<file>.md use $transcript-question-page-audit targeted wording pass: reduce routine "He said" style openings in short and expanded answers. Check only affected rows against the transcript as needed. Preserve row count, timestamps, questions, links, transcript-supported caveats, and answer meaning. Do not search for missing questions.
```

This is slower than wording-only, but still avoids a full transcript completeness audit.

## Full Audit

Use this when the page needs a real semantic audit, including missing-question checks.

```text
docs/questions/<file>.md use $transcript-question-page-audit find and fix issues silently with full transcript coverage
```

This should inspect the full transcript, verify existing rows, add high-confidence missing questions, fix timestamps and answer support, and append the audit log.

## Full Audit With Q&A Style Emphasis

Use this when the page needs a full audit and should also be brought closer to the current direct-question / concise-answer style.

```text
docs/questions/<file>.md use $transcript-question-page-audit find and fix issues silently with full transcript coverage; also apply the current Q&A wording style to retained and changed rows, including direct searchable questions and removing routine "He said" openings where meaning stays the same
```

This is better than expecting the default full audit prompt to catch every style issue, because style cleanup is named as a priority.

## Full Audit With Extra Caution

Use this when the page was created by a lower-recall pass or looks especially thin.

```text
docs/questions/<file>.md use $transcript-question-page-audit find and fix issues silently with full transcript coverage. Inspect the TXT transcript from beginning to end without gaps, compare all real audience questions to the page, verify every retained row, and add only high-confidence missing questions.
```

## Style-Only Batch Line

Use this for a serialized task-note queue when each line should be processed independently.

```text
docs/questions/<file>.md use $transcript-question-page-audit wording-only pass: remove routine "He said" style openings from short and expanded answers where meaning stays the same. Preserve row count, timestamps, questions, links, and transcript-supported caveats. No missing-question audit. Do not update src/transcript-audit.log because this is only a wording change.
```

## Full-Audit Batch Line

Use this when the serialized queue should run one complete audit per file.

```text
docs/questions/<file>.md use $transcript-question-page-audit find and fix issues silently with full transcript coverage
```

## Choosing The Pattern

- Use wording-only when only prose style is being cleaned up.
- Use targeted wording when answer phrasing may need transcript spot-checks.
- Use full audit when missing questions, timestamps, unsupported answers, or completeness are in scope.
- Add "with current Q&A wording style" when a full audit should also reduce "He said" style openings.
- Include the project-root-relative path to reduce file discovery work and avoid wrong-file matches.
