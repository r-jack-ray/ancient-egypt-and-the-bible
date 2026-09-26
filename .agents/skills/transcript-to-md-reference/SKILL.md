---
name: transcript-to-md-reference
description: Create curated Ancient Egypt and the Bible Q&A Markdown pages under docs/questions from transcript sources under src/transcripts. Use for first-pass page creation with all real audience questions, direct searchable wording, transcript-grounded short and expanded answers, question-start timestamps, and YouTube links. Do not use for auditing or repairing an existing page.
---

# Transcript to MD Reference

**Write the answers directly. This site already establishes Dr Falk as the source. Zero routine host attribution, passive reporting, or mechanical framing is a completion requirement across questions, short answers, and expanded answers. Even one unnecessary `Falk says`, `he explains`, `the criticism is`, or equivalent wrapper must be removed.**

## Overview

Create curated Markdown reference pages from livestream transcript files. The goal is not to reproduce the whole transcript. The goal is to make GitHub Pages readers able to:

- find real audience questions
- scan a short answer direction
- read a filled transcript-grounded expanded answer
- open the original video at the right timestamp

The public-facing Markdown output belongs under `docs/questions/`. Keep raw transcript source data under `src/`.

The canonical public livestream inventory is `src/channel/episodes.json`. Treat it as stream-centric, not episode-only. It may include numbered Q&A livestreams, special streams, and other public `/streams` entries. Do not limit processing to numbered episodes unless the user explicitly asks for numbered episodes only.

This skill is for first-pass page creation with Codex. Use `transcript-question-page-audit` for later correction passes, completeness audits, timestamp repairs, or minimal-diff improvements to existing pages.

Before drafting public prose, read `.agents/skills/humanizer/SKILL.md` completely. Reserve its embedded-mode rewrite loop for the final public-wording pass below.

## Default Behavior

Default to creating the requested page or pages with full transcript coverage. Keep artifact completeness and validation independent of closeout length.

- Inspect the complete working transcript before claiming that a page includes all real audience questions.
- Candidate searches are an accelerator, not proof of completeness.
- Prefer high-confidence transcript-grounded wording over speculative cleanup.
- Do not add outside facts, even when they appear historically correct.
- In the final response, retain files created, question-row counts, validation performed, and every material blocker or uncertainty; trim introductions, repetition, and optional background first.

## Source Files

Use the current repository layout:

1. Canonical archive identity: `src/channel/episodes.json`
2. Transcript mapping and validation facts: `src/transcripts/manifest.json`
3. Source transcript: `src/transcripts/txt/<fileStem>.txt`

Transcript source rules:

- Use TXT as the transcript source of record and default curation surface.
- Resolve the stable `fileStem` from the manifest.
- Treat retained legacy JSON as optional historical evidence; normal creation must not require it or create a new JSON payload.

If an expected TXT file is missing, validate the store and, when acquisition is authorized, use the safe all-eligible TypeScript batch:

```powershell
npm run check:transcript-store
npm run fetch:transcripts -- --dry-run
npm run fetch:transcripts
```

Acquisition guardrails:

- Use `--limit 1` only as a general batch canary; it does not select a video ID.
- Do not invent a page when acquisition reports unavailable captions or no transcript segments.
- Keep temporary structured diagnostics under ignored `reports/` rather than in the tracked transcript store.

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

When the user asks for the "next" episode pages, use the next missing ordinary pages in ascending numbered order from `src/channel/episodes.json`, based on actual files under `docs/questions/`. Treat README/status text as hints only.

If a blocked placeholder appears in a batch, report it and continue only when later non-empty transcript sources can still satisfy the requested count. Preserve `src/channel/episodes.json` order for non-numbered streams unless the user gives another order.

## Creation Workflow

### 1. Route The Target

For each requested stream:

1. Identify the stream, episode number if present, title, URL, and slug.
2. Use `src/channel/episodes.json` to confirm the title, YouTube video URL, and slug.
3. Check whether the intended output page already exists under `docs/questions/`.
4. If it exists, do not overwrite it as a first-pass creation task. Use `transcript-question-page-audit` unless the user explicitly asks to regenerate or replace it.

### 2. Confirm Transcript Sources

1. Resolve the video ID and stable `fileStem` through `episodes.json` and `manifest.json`.
2. Confirm the manifest-owned TXT exists under `src/transcripts/txt/`.
3. If the manifest or TXT is missing or invalid, run the store validator and report the blocker.
4. Use the direct single-video TypeScript command only when acquisition is authorized for that registered ID.
5. If acquisition reports unavailable captions or no segments, do not create a fabricated page.

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
4. Add a direct short answer or answer direction only when the transcript clearly supports it. Apply the attribution rule while drafting the question and answer.
5. Add a direct, transcript-grounded expanded answer that gives the main reasoning, caveats, examples, or limits supported by the answer span, without routine host attribution or source wrappers.
6. Preserve uncertainty when the answer is incomplete or indirect.
7. Write the output under `docs/questions/`.
8. After all transcript-backed row content is drafted, run the Final Public-Wording Pass below before verifying the rows.

### 7. Verify Every Row

Before considering the page complete:

- verify every row against its supporting transcript area
- verify every timestamp points to the audience-question start
- verify every answer summary against the relevant answer span
- confirm that no candidate represents a missing real audience question
- confirm that the full TXT transcript was inspected without gaps
- confirm that no outside facts were added

Derive exact seconds from the TXT display timestamp. If a temporary structured diagnostic is needed, keep it under ignored `reports/`; do not add a tracked TSV or JSON transcript payload.

### 8. Validate And Update Navigation

1. Validate that all table rows render cleanly.
2. Validate that timestamp display text matches the `?t=` seconds value.
3. Count the final question data rows.
4. Review the resulting diff.
5. Update navigation and status references, especially `README.md`, when adding or moving public curated pages.
6. If several pages were created in parallel, serialize shared-file updates such as `README.md`, indexes, status records, and `src/transcript-audit.log` through the parent agent.
7. Run the scoped wording check described under Validation as the final page check.
8. Append the creation or regeneration tracking record only after the page and related changes have been validated and the scoped wording check has passed.

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
| <a href="https://youtu.be/VIDEO_ID?t=136" target="_blank" rel="noopener noreferrer">2:16</a> | Did the Sea Peoples' attacks on Egypt under Merneptah and Ramesses III contribute to the end of the New Kingdom? | Yes, especially under Ramesses III, but the decline was a longer economic and political process. | The Sea Peoples' attacks contributed to the decline, especially in Ramesses III's reign. Economic and political strain also contributed, so foreign attacks alone do not explain the end of the New Kingdom. |
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

When the TXT transcript line has only the display timestamp, convert it precisely to seconds for the URL.

## Wording And Summary Rules

Question wording should create direct, searchable questions:

- write direct questions, not transcript fragments or topic labels
- preserve the user's wording when it helps specificity or searchability
- remove filler, false starts, and repeated setup when meaning is unchanged
- combine split transcript fragments and correct obvious transcript artifacts
- keep names, titles, Bible references, Egyptian terms, dates, and chronology markers searchable
- do not add context from the answer into the question
- remove conversational addressee framing such as `What does he think about...` or `What does Dr Falk recommend...`; ask directly about the subject or requested recommendation unless the question concerns an actual personal fact
- do not silently resolve an unclear proper noun or technical term from outside knowledge

Answer wording should explain the subject directly and be useful in search results. Direct advice such as `Start with...` or `Get help with...` is appropriate for recommendations:

- write short and expanded answers as direct explanations or advice, preserving the supported reasoning and detail
- reflect the transcript-supported answer
- preserve caveats, uncertainty, disagreement, and limits
- avoid outside research
- remove routine reporting frames such as "He said," "He argued," "He explained," or equivalents using `the host` wherever they appear
- apply the question-subject attribution rule below to questions and both answer columns, including sentences after the opening
- preserve interpretation, uncertainty, disagreement, opinion, humor, and source limits in the substance of the answer; these categories alone do not justify host attribution
- preserve claim type through the actual wording: advice stays advice, uncertainty stays uncertain, and a personal knowledge limit stays personal; the site's established source does not need to be restated
- apply only the concrete attribution exceptions below; `claim ownership`, `personal judgment`, and `third-person prose` are not general reasons to insert the host
- prefer compact phrasing suitable for search results, tables, and index pages
- preserve the difference between what the question asks and what the answer actually supports

### Question-Subject Attribution Rule

The site, page, and video link already supply provenance. Readers know whose answers these are. Write the substance directly from the first draft, and preserve already direct wording during audits. Do not add a host reference to make prose sound more careful, scholarly, or transcript-grounded.

- **Ordinary subject questions require no host attribution.** Make the passage, event, object, argument, or other actual subject the grammatical subject. `What do you think...`, `How do you interpret...`, `Do you believe...`, and `What do you recommend...` are ordinary ways of asking a subject question. Remove that framing from the curated question. Interpretation, theology, disagreement, advice, and recommendations do not become personal-profile questions just because they were addressed to Dr Falk.
- Remove routine `Falk says`, `Dr Falk recommends`, `he explains`, `he argues`, `he thinks`, `he notes`, `he adds`, `he rejects`, `he interprets`, and equivalent reporting anywhere in questions or answers. One such frame per row or cell is still over-attribution. Changing the verb, using `the host`, or replacing `he` with `Dr Falk` does not fix it.
- Remove disguised source wrappers too: `in his view`, `in this account`, `in this explanation`, `according to the discussion`, `the answer identifies`, and `the transcript says`. Do not add `in this reading` or `one possible interpretation` merely to replace a deleted host reference. A qualifier belongs only when it preserves an expressed degree of uncertainty or distinguishes an actual alternative in the answer.
- Remove mechanical labels that announce what the sentence is doing: `the criticism is`, `the point is`, `the argument is`, `the answer is`, `the explanation is`, `the recommendation is`, and `the conclusion is`. State the criticism, reason, answer, or advice directly. Do not swap one label for another or write abstractions such as `the criticism rejects`. Preserve a named argument or criticism when it is the actual subject being examined; the defect is the empty lead-in, not the noun itself.
- Remove process narration such as `the conclusion here leans`, `the discussion leaves open`, `the answer favors`, and `the response stops short of`. This rule covers equivalent wording, not just the listed strings. State the supported likelihood or unresolved issue directly: `A later date is more likely` or `The date remains uncertain`. Preserve the actual degree of uncertainty and the reason for it; do not make the discussion, conclusion, or answer stand in for the subject.
- Avoid passive reporting language: `is described as`, `is presented as`, `is viewed as`, `is considered`, `is interpreted as`, `it is argued that`, `is recommended`, and `is said to`. Do not remove `Falk says` only to hide the same reporting in passive voice. State the supported description, inference, or advice directly. When an actual quotation or allegation needs an owner, name that owner briefly. Ordinary factual passives such as `The temple was built...` are not reporting frames.
- Preserve the claim's strength in its substance: keep `likely`, `may`, or an explicit limit when the transcript supports it. Do not add hedges to a confident answer. Give recommendations as advice, for example `Start with Kelley's Hebrew grammar, especially the third edition`; do not frame ordinary advice as `Dr Falk recommends...` or turn it into an unsupported universal ranking.
- Retain a host reference only for a concrete personal fact (biography, experience, plans, self-description, or a personal knowledge limit), a quotation or allegation that requires an owner, or an actual comparison between speakers that would otherwise be ambiguous. A topic opinion or recommendation alone does not qualify. In mixed answers, confine attribution to the personal fact or necessary comparison and explain the subject directly. `He has not read the book` must remain personal.
- For each retained reference, identify the exact personal fact, quotation or allegation owner, or speaker distinction that would be lost without it. `It is his interpretation`, `it is his recommendation`, `claim ownership`, and `it sounds more cautious` fail this test. Use the minimum reference needed where the exception applies; it does not license host narration elsewhere in the row. These are internal editing decisions, not disclaimers to add to the page.
- Preserve names and pronouns referring to biblical or historical figures, authors, guests, or other actual subjects. Preserve evidence, reasoning, examples, and caveats. Rewrite naturally rather than using passive reporting (`is considered`, `is recommended`) or an abstract source proxy to conceal redundant attribution.

Illustrative wording patterns (use only claims supported by the actual transcript):

| Question context | Avoid | Prefer |
|---|---|---|
| A subject question addressed to the host | `What does he think of the similarities between Psalm 104 and the Hymn to the Aten?` | `How are Psalm 104 and the Hymn to the Aten related?` |
| A request for a learning resource | `Which book does Dr Falk recommend for learning biblical Hebrew?` | `Which book should I use to learn biblical Hebrew?` |
| Ordinary advice | `He recommends Kelley's Hebrew grammar and advises getting help with the alphabet.` | `Start with Kelley's Hebrew grammar. Get help with the alphabet at the beginning.` |
| Disguised source framing | `In his explanation, shared cultural transmission is likely.` | `Shared cultural transmission is likely.` |
| A mechanical criticism label | `The criticism is that the claim lacks evidence.` | `The claim lacks evidence.` |
| A mechanical advice label | `The recommendation is to get help with the alphabet.` | `Get help with the alphabet.` |
| A narrated likelihood | `The conclusion here leans toward a later date.` | `A later date is more likely.` |
| A narrated uncertainty | `The discussion leaves open whether the texts are directly related.` | `Whether the texts are directly related remains uncertain.` |
| Passive reporting | `The passage is described as using a metaphor.` | `The passage uses a metaphor.` |
| A passive recommendation | `Getting help with the alphabet is recommended.` | `Get help with the alphabet.` |
| An ordinary Bible question | `He explains that the passage uses a metaphor. He adds that the surrounding verses explain it.` | `The passage uses a metaphor, which the surrounding verses explain.` |
| An explicitly tentative interpretation | `He thinks this might refer to a local event.` | `This might refer to a local event.` |
| A question about his reading | `The book has not been read.` | `He has not read the book.` |

Expanded answers:

- are required for ordinary pages unless the user explicitly asks to defer them
- must be transcript-grounded and useful as a standalone explanation
- keep expanded answers consistent with the short answer
- do not use outside research
- preserve caveats, uncertainty, and limits in the answer span
- do not merely repeat the short answer word-for-word unless no fuller answer is supported

Use uncertainty when needed:

```text
The date remains uncertain.
```

## Final Public-Wording Pass

After the complete question inventory and transcript-grounded row content are drafted, and before final row verification, validation, navigation updates, and creation logging:

1. Apply `$humanizer` in embedded mode. Run its draft, audit, and final loop internally, then write only the final prose to the page. Do not place Humanizer draft text, audit bullets, or a separate Humanizer summary in the Markdown, audit log, or handoff.
2. Review every authored public prose field in the new page with Humanizer: questions, short answers, expanded answers, and any SEO description or other authored public prose. This defines the review scope, not a rewrite quota. Leave clean prose unchanged. Read each short and expanded answer together, then scan adjacent rows so repeated attribution and uniform sentence patterns are visible across the page.
3. Treat the transcript and this skill's evidence-preservation rules as higher priority than generic Humanizer defaults. Preserve every supported claim, proper noun, title, date, number, Bible reference, technical term, searchable question detail, qualification, caveat, uncertainty, interpretation, disagreement, opinion, humor, personal experience, and source limitation. Do not resolve unclear names or terms from outside knowledge, turn an interpretation into an objective fact, or add specificity absent from the transcript.
4. Run an explicit over-attribution and mechanical-framing check, including for GPT-6 output. Apply the Question-Subject Attribution Rule to every question, short answer, and expanded answer, including later sentences. Scan `Falk`, `Dr. Falk`, `he`, `his`, generic speaker labels, reporting verbs, source wrappers, and lead-ins such as `the criticism is` in context. Inspect the diff for framing added to previously direct prose. Every unnecessary occurrence is an issue even if it occurs only once or passes the wording checker.
5. Apply the concrete exception test to every retained host reference. Check both answer columns independently; an exception in one cell does not authorize attribution in the other. Read adjacent rows for repeated frames. Zero routine host attribution, passive reporting, or mechanical framing is required before completion; references that pass a concrete exception may remain.
6. Preserve supported uncertainty and advice through natural subject wording. Awkwardness after deleting a name is a reason to rewrite the sentence, not permission to restore redundant attribution. Do not substitute passive reporting, an abstract source proxy, or labels such as `the criticism is`. Do not add public disclaimers to explain these editing decisions.
7. Determine speaker context from the transcript before removing a name or pronoun. Preserve audience members, guests, quoted scholars, historical figures, and other people who could be confused with the main speaker. Do not replace one repetitive label with another.
8. During this pass, leave stream-identifying headings, timestamp anchors and link targets, table columns, row order, Markdown structure, filenames, source identity, and audit-log text unchanged.
9. Recheck every rewritten cell against its answer span and its pre-Humanizer wording. Confirm that the claim is still the same kind of claim and that the sentence has a natural subject and verb. Reject or revise wording that adds, removes, strengthens, weakens, generalizes, or reattributes a claim. The scoped wording check remains an additional validation gate, not a substitute for this evidence check.

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

If a TXT file was acquired for the stream, verify it exists at the manifest-owned path and passes `npm run check:transcript-store`.

If a new curated page was added, ensure `README.md` links to the new page when the surrounding README section lists curated episodes or curated pages.

After completing every other page edit and validation step, run the scoped wording
check on the created page. Run this immediately before appending its creation or
regeneration record to `src/transcript-audit.log`:

```powershell
npm run check:question-wording -- --path $path --strict --review
```

Fix every actionable high-confidence issue and rerun the command until it exits
successfully. Adjudicate each review candidate against the transcript using the
Question-Subject Attribution Rule. The semantic completion gate is zero routine
host attribution, passive reporting, or mechanical framing in questions and both answer columns,
including source wrappers and lead-ins such as `the criticism is`. A passing scan
or a `review` classification does not waive this rule. Retain only references that
pass a concrete exception. Their presence means the raw candidate count need not
reach zero; `--strict-review` is not the completion gate.

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
- questions and both answer columns contain zero routine host attribution, passive reporting, source-wrapper substitutes, or mechanical lead-ins such as `the criticism is`; existing direct prose has not gained new framing
- the embedded Humanizer pass covered all authored public prose and every rewrite was rechecked against the transcript
- ordinary subject questions ask about the subject directly; both answer columns explain it directly; the attribution check covered later sentences and every retained host reference passed a concrete exception
- Humanizer rewrites preserve claim type and ownership; attribution removal did not turn self-description, judgment, recommendation, or personal knowledge into a categorical, passive, or awkward claim
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
- the scoped `check:question-wording` command passed for the created page after all other page checks; review candidates were adjudicated against the transcript rather than bulk-rewritten
- the creation or regeneration record was appended only after independent transcript analysis and page validation
- the recorded `coverage=full` matches the work actually performed
- ordinary first-pass creation records use `could_use_further_inspection=yes` and do not claim that an audit occurred
- no successful creation record was appended for a blocked or uncreated page
- newly acquired transcripts, when authorized, were produced by the direct TypeScript TXT pipeline
- `README.md` explicit episode links and current-status text are updated when needed
- shared navigation or status files were updated serially
- the diff was reviewed
