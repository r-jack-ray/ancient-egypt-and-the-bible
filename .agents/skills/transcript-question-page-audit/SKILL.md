---
name: transcript-question-page-audit
description: Find and fix issues in existing Ancient Egypt and the Bible Q&A Markdown pages under docs/questions against transcript sources. Use for page-scoped correction passes covering missing questions, timestamps, answer support, four-column tables, and links. Do not use for first-pass page creation.
---

# Transcript Question Page Audit

**Write the answers directly. This site already establishes Dr Falk as the source. Zero routine host attribution, passive reporting, or mechanical framing is a completion requirement across questions, short answers, and expanded answers. Even one unnecessary `Falk says`, `he explains`, `the criticism is`, or equivalent wrapper must be removed.**

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

Before editing public prose, read `.agents/skills/humanizer/SKILL.md` completely. Reserve its embedded-mode rewrite loop for the final public-wording pass below.

## Scope Boundary

Treat the page or pages named by the user as the complete audit scope. For each target page, access only the material needed for that page:

- the named Q&A Markdown page
- its exact records in `src/channel/episodes.json` and `src/transcripts/manifest.json`
- its manifest-owned TXT transcript
- this skill, the Humanizer skill, and directly invoked validator implementation when troubleshooting a target-scoped check
- `src/transcript-audit.log`, limited to target-file history when needed and one authorized append after validation

Use explicit file paths and target-scoped commands throughout the audit. Do not inventory the repository or inspect unrelated worktree state:

- do not run `git status`, an unscoped `git diff`, `git diff --stat`, or another command that lists repository-wide changes
- do not open, diff, summarize, or report changes in `package.json`, lockfiles, other Q&A pages, other transcripts, generated site files, or any file outside the target's evidence and validation path
- do not inspect neighboring pages or transcripts for comparison, style, possible omissions, or concurrent work unless the user explicitly adds them to the audit scope
- if unrelated paths appear incidentally in command output, ignore them and continue without investigating or mentioning them

Only the target page and one audit-log record may be changed by this workflow. Write a report or diagnostic file only when the user explicitly requests one. If a validator cannot remain target-scoped, use the target-only fallback checks in this skill instead of broadening the audit.

## Sources

Use these in order:

1. Existing page: `docs/questions/<slug>-questions.md`
2. Canonical identity and path: `src/channel/episodes.json` and `src/transcripts/manifest.json`
3. Source transcript: `src/transcripts/txt/<fileStem>.txt`

If an expected TXT is missing, stop and report the store inconsistency. Do not
run repository-wide store validation or all-eligible transcript acquisition as
part of this page audit. Acquisition is a separate task that requires explicit
user authorization before the audit can resume.

Source guardrails:

- Stop for that page and report the blocker when the manifest is invalid or the TXT is missing.
- Do not guess from the existing Markdown.
- Do not inspect retained legacy JSON unless the user explicitly identifies it as evidence for the named page.

Special-purpose pages may not match the source slug exactly. Resolve the source stream from the page heading and links, then the exact matching records in `src/channel/episodes.json` and `src/transcripts/manifest.json`. Do not inspect nearby Q&A pages or transcript files to infer the mapping. If the exact source remains ambiguous, stop and report the blocker.

## Audit Workflow

### 1. Route And Scan

The coordinating agent reads the Markdown page first. Extract:

- source video ID from timestamp links
- current row timestamps and questions
- current question-row count
- table shape and obvious link problems

Use `src/channel/episodes.json` to confirm uncertain title, slug, or video ID.

Do not require legacy JSON or create diagnostics. The canonical TXT should answer page-scoped audit questions.

Independent discovery agents may start from the verified canonical TXT without reading the existing question list or earlier findings. See Parallel And Batch Guidance.

### 2. Determine Coverage

Use **full coverage** by default for a general audit and whenever the task includes:

- finding missing questions
- checking page completeness
- repairing a page produced by a potentially low-recall first pass
- deciding whether the page needs further semantic inspection

Use **targeted coverage** only when the user names a narrow issue such as one
timestamp, one row, a known link problem, attribution-only cleanup, or formatting-only validation.

Full coverage means:

- inspect the working TXT transcript from beginning to end
- use contiguous bounded windows with overlap so no transcript range is skipped
- discover audience-question turns directly from the TXT, including turns absent from the existing page; existing rows and timestamps must not define the discovery scope
- reconcile the transcript-derived question inventory with the page, checking for missing questions, omitted follow-ups, and distinct questions incorrectly merged into one row
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
- remove routine host attribution and source wrappers from questions and both answer columns; do not add them to already direct prose
- repair missing, placeholder, or deferred expanded answers
- revise expanded answers when they are unsupported, too thin or over-compressed to be useful, duplicated from the short answer, contradicted by the short answer, or stale after a row change
- complete truncated question wording
- split merged distinct questions or merge duplicates
- remove non-question housekeeping rows
- fix table, link, or pipe formatting

After all transcript-backed content decisions are complete, run the Final Public-Wording Pass below before verifying the rows.

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
- remove conversational addressee framing such as `What does he think about...` or `What does Dr Falk recommend...`; ask directly about the subject or requested recommendation unless the question concerns an actual personal fact

Short answers should be concise and search-friendly. Expanded answers should explain the subject directly with enough detail to be useful. Direct advice such as `Start with...` or `Get help with...` is appropriate for recommendations:

- keep short answers concise; let expanded answers use the wording needed to explain the transcript-supported answer fully
- reflect the transcript-supported answer
- preserve caveats, uncertainty, disagreement, and limits
- avoid outside research
- make routine answer cells answer-shaped, not report-shaped: prefer `Pyramids were resurrection machines...` over `The host described pyramids as...`
- prefer direct answer phrasing such as `The Greek term means...`, `Wine was already present...`, and `The ark's danger is tied...`
- do not mechanically replace "He said" with "The host said"; if attribution is unnecessary, remove the attribution frame entirely
- avoid routine openings such as "He said," "He says," "He rejects," "He argued," "He explained," "The host said," "The host argued," or "The host explained"
- apply the question-subject attribution rule below to questions and both answer columns, including sentences after the opening
- preserve interpretation, uncertainty, disagreement, opinion, humor, and source limits in the substance of the answer; these categories alone do not justify host attribution
- preserve claim type through the actual wording: advice stays advice, uncertainty stays uncertain, and a personal knowledge limit stays personal; the site's established source does not need to be restated
- apply only the concrete attribution exceptions below; `claim ownership`, `personal judgment`, and `third-person prose` are not general reasons to insert the host
- prefer compact phrasing for short answers; keep expanded answers focused without forcing them into short-answer length

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
- **Use pronouns when his identity is clear.** If the question already identifies Dr Falk and there is no ambiguity, use `he`, `him`, or `his` for necessary personal references in both answer columns. Do not restate his name, including for biography or a personal knowledge limit. The same applies when the page or preceding sentence already makes the referent clear. A permitted personal reference does not require a repeated name; use the name only to resolve actual ambiguity. This does not permit routine `he says` or equivalent reporting where attribution should be removed entirely.
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
| `Is Dr Falk familiar with Lamashtu?` | `Yes, though Dr Falk is not a specialist on her and knows little of her stories.` | `Yes, though he is not a specialist on her and knows little of her stories.` |

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
The date remains uncertain.
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

## Final Public-Wording Pass

After the transcript comparison and all row-content decisions are complete, and before final row verification, validation, and audit logging:

1. Apply `$humanizer` in embedded mode. Run its draft, audit, and final loop internally, then write only the final prose to the page. Do not place Humanizer draft text, audit bullets, or a separate Humanizer summary in the Markdown, audit log, or handoff.
2. Review every authored public prose field in the target page with Humanizer: questions, short answers, expanded answers, and any SEO description or other public prose changed during the audit. This defines the review scope, not a rewrite quota. Leave clean prose unchanged. Read each short and expanded answer together, then scan adjacent rows so repeated attribution and uniform sentence patterns are visible across the page.
3. Treat the transcript and this skill's evidence-preservation rules as higher priority than generic Humanizer defaults. Preserve every supported claim, proper noun, title, date, number, Bible reference, technical term, searchable question detail, qualification, caveat, uncertainty, interpretation, disagreement, opinion, humor, personal experience, and source limitation. Do not resolve unclear names or terms from outside knowledge, turn an interpretation into an objective fact, or add specificity absent from the transcript.
4. Run an explicit over-attribution and mechanical-framing check, including for GPT-6 output. Apply the Question-Subject Attribution Rule to every question, short answer, and expanded answer, including later sentences. Scan `Falk`, `Dr. Falk`, `he`, `his`, generic speaker labels, reporting verbs, source wrappers, and lead-ins such as `the criticism is` in context. Inspect the diff for framing added to previously direct prose. Every unnecessary occurrence is an issue even if it occurs only once or passes the wording checker.
5. Apply the concrete exception test to every retained host reference. Check both answer columns independently; an exception in one cell does not authorize attribution in the other. For every retained host name, check whether the question or surrounding prose already makes a pronoun unambiguous, and use the pronoun if so. Read adjacent rows for repeated frames. Zero routine host attribution, passive reporting, or mechanical framing is required before completion; references that pass a concrete exception may remain.
6. Preserve supported uncertainty and advice through natural subject wording. Awkwardness after deleting a name is a reason to rewrite the sentence, not permission to restore redundant attribution. Do not substitute passive reporting, an abstract source proxy, or labels such as `the criticism is`. Do not add public disclaimers to explain these editing decisions.
7. Determine speaker context from the transcript before removing a name or pronoun. Preserve audience members, guests, quoted scholars, historical figures, and other people who could be confused with the main speaker. Do not replace one repetitive label with another.
8. During this pass, leave headings that identify the stream, timestamp anchors and link targets, table columns, row order, Markdown structure, filenames, source identity, and audit-log text unchanged unless a separate transcript-backed audit decision already requires a change.
9. Recheck every rewritten cell against its answer span and its pre-Humanizer wording. Confirm that the claim is still the same kind of claim and that the sentence has a natural subject and verb. Reject or revise wording that adds, removes, strengthens, weakens, generalizes, or reattributes a claim. The scoped wording check remains an additional validation gate, not a substitute for this evidence check.

## Validation

After edits, run only target-scoped checks. For ordinary pages, use the scoped
repo validator, which requires four-column rows and populated expanded answers
by default:

```powershell
npm run check:question-tables -- --path docs/questions/FILE.md
```

Do not run the unscoped `npm run check:question-tables` command during this
workflow. If the scoped command ignores its path, reports unrelated files, or
cannot run cleanly, stop using it for this audit and run the local target-file
checks below.

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

Also verify:

- Display timestamps match `?t=` seconds for changed rows or when links were edited.
- Ordinary-page table headers are exactly `| Time | Question | Short answer / answer direction | Expanded answer |`.
- Every ordinary-page data row begins with a timestamp link.
- Every expanded-answer cell contains non-empty, transcript-grounded text.
- Any remaining `_Expansion pending._` row is recorded as an explicit deferral or blocker; strict table validation will fail until it is resolved.
- Transcript inspection supports the expanded-answer prose; a passing structural validator alone does not establish semantic support.

After completing every other page edit and targeted check, run the scoped wording
check on the page as the final validation step. For a logged audit, run it
immediately before appending `src/transcript-audit.log`:

```powershell
npm run check:question-wording -- --path docs/questions/FILE.md --strict --review
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

Lead with the result. Report only the named page, its matching transcript, the
target-scoped checks, and the authorized audit-log append. Do not mention or
characterize unrelated worktree changes. For completed change tasks, use the
repo's compact closeout shape when it fits:

- Changed:
- Files:
- Checked:
- Notes:

Mention every material blocker or uncertainty. Do not list every transcript candidate or unchanged row unless the user asked for a report.

When parallel agents were used, distinguish agents that read the original TXT from structural or wording helpers. Distinguish collective full coverage across assigned ranges from independent repeated full-transcript reads.

## Parallel And Batch Guidance

- Multiple semantic agents may review the same page and original canonical TXT. This skill imposes no per-page or per-transcript limit on their number; choose the allocation for transcript length, difficulty, available capacity, and the user's request.
- For a full audit using parallel agents, assign multiple agents to semantic reading of the original TXT. Structural, link, and wording helpers supplement transcript review and do not count as independent transcript scans.
- Include a fresh question-discovery pass covering the entire TXT, assigned to one agent or divided among agents in contiguous overlapping ranges. Give discovery agents the verified source identity, TXT path, and inclusion rules; withhold the existing question list and previous findings until they return their transcript-derived candidates. This lets the audit recover questions missed during initial page creation.
- Start discovery agents without inherited conversation history containing the page or prior findings (for example, `fork_turns="none"`). Supply the verified source identity and path, scope, skill instructions, and reading/inclusion rules explicitly.
- Other semantic agents can verify existing rows, independently reread the whole transcript, or examine overlapping ranges and difficult passages. Combine these approaches as useful. Extend range boundaries to capture complete question-and-answer turns.
- Each transcript reviewer reports the exact ranges read, candidate question-start timestamps, supporting answer spans, and unresolved issues. The coordinator reconciles the coverage map, deduplicates overlap findings, and adjudicates disagreements and unmatched candidates against the TXT. Every discovered candidate must be represented by a supported row or have a reason for exclusion; an unchanged row count is not proof of completeness.
- For batches, keep each assignment tied to its named page and manifest-owned transcript. Several reviewers may share that assignment; do not inspect unrelated pages or transcripts.
- Semantic subagents remain read-only. One coordinating agent applies edits, performs final validation, and appends one audit-log record per audited page serially.
- Do not treat candidate-search output as complete transcript coverage.

## Audit Log

Use `src/transcript-audit.log` as an append-only tracking record, not as transcript evidence.

Before editing, count actual question rows as `question_count_before`. After editing and validation, count final question rows as `question_count_after` and calculate:

```text
question_count_change = question_count_after - question_count_before
```

Logging rules:

- Confirm the recorded counts agree.
- Do not read or summarize the whole log before auditing.
- After the independent audit, search only for target-file records if prior history may clarify unresolved concerns.
- Append exactly one new record after validation.
- Preserve existing records without rewriting, sorting, or normalizing them.
- Do not add or infer an `audit_pass` number.

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
- questions and both answer columns contain zero routine host attribution, passive reporting, source-wrapper substitutes, or mechanical lead-ins such as `the criticism is`; existing direct prose has not gained new framing
- the embedded Humanizer pass covered all authored public prose and every rewrite was rechecked against the transcript
- ordinary subject questions ask about the subject directly; both answer columns explain it directly; the attribution check covered later sentences and every retained host reference passed a concrete exception
- Humanizer rewrites preserve claim type and ownership; attribution removal did not turn self-description, judgment, recommendation, or personal knowledge into a categorical, passive, or awkward claim
- expanded answers are populated, transcript-supported, sufficiently developed for the source answer, consistent with short answers, and preserve uncertainty
- no `_Expansion pending._` cells remain unless the user explicitly deferred them and the final output/audit log records the blocker
- no outside facts were added
- table rows render cleanly
- no placeholder links or legacy links remain
- `question_count_before`, `question_count_after`, and `question_count_change` agree
- full-coverage audits inspected the TXT transcript from beginning to end without gaps
- the transcript-derived question inventory was reconciled with the page, including questions missed during initial creation; parallel coverage reports support the claimed discovery and verification coverage
- targeted audits were limited only because the user requested or identified a narrow scope
- the scoped `check:question-wording` command passed for the processed page after all other page checks; review candidates were adjudicated against the transcript rather than bulk-rewritten
- the audit log was appended only after independent page analysis and validation
- the recorded `coverage` value matches the work actually performed
- the target-page diff was reviewed with an explicit pathspec; no repository-wide status or diff inspection was performed
- final response retains all material changes, checks, blockers, and uncertainty without optional transcript-by-transcript detail
