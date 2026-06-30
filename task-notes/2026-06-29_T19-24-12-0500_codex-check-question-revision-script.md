# Codex Review Task: Check `Get-QuestionRevisionCandidates.ps1`

## Goal

Review the PowerShell script intended to identify which processed question Markdown files may need further revision by comparing:

- `docs/questions/*.md`
- `src/transcripts/txt/*.txt`

The script should produce triage reports showing missing file pairs, suspiciously low question density, red-flag wording, duplicate question headings, timestamp-link issues, and other revision-risk signals.

## Target Script

Expected script path:

```text
scripts/Get-QuestionRevisionCandidates.ps1
```

If the script has a different name or location, locate the closest matching PowerShell script that analyzes `docs/questions` and `src/transcripts/txt`.

## Review Priorities

Check the script for correctness, reliability, and usefulness. Prioritize practical issues over style-only changes.

### 1. Repository-relative behavior

Confirm that the script works when run from the repository root:

```powershell
pwsh .\scripts\Get-QuestionRevisionCandidates.ps1
```

Also check whether the `-RepoRoot` parameter works when supplied explicitly:

```powershell
pwsh .\scripts\Get-QuestionRevisionCandidates.ps1 -RepoRoot "C:\Workspaces\ancient-egypt-and-the-bible"
```

The script should not require hard-coded local paths.

### 2. Directory assumptions

Verify these defaults:

```text
docs/questions
src/transcripts/txt
reports
```

Confirm that the script fails clearly if the source directories are missing and creates the output directory when needed.

### 3. Filename matching

Check that processed Markdown files map correctly to transcript TXT files.

Expected examples:

```text
docs/questions/211-when-your-guest-is-a-gas-bag-questions.md
src/transcripts/txt/211-when-your-guest-is-a-gas-bag.txt
```

These should normalize to the same slug:

```text
211-when-your-guest-is-a-gas-bag
```

Look for edge cases:

- files that do not end in `-questions.md`
- transcript files with unusual names
- duplicate slugs
- non-numbered livestream files
- Markdown files without matching TXT files
- TXT files without matching Markdown files

If duplicate slugs are possible, make sure the script reports or handles them safely rather than silently overwriting one entry.

### 4. Line, word, and file-size counting

Check whether the line-count logic is correct for:

- empty files
- one-line files with no trailing newline
- files ending with a newline
- CRLF and LF endings

Check whether word counting is good enough for transcript text and Markdown text. It does not have to be perfect, but it should be stable and useful.

### 5. Question counting

Check whether the script’s question-count logic matches the actual Markdown structure in `docs/questions`.

Important: do not assume every question is necessarily represented the same way. Inspect several real files.

Look for patterns such as:

```markdown
## Why does ...?
### Why does ...?
- Why does ...?
1. Why does ...?
```

If the actual question pages use a specific heading level or list format, adjust the regex to match that format accurately.

Avoid overcounting ordinary prose that happens to contain a question mark.

### 6. Timestamp-link detection

Check whether timestamp-link detection matches the real output format used in the Markdown files.

Look for formats such as:

```markdown
[12:34](https://www.youtube.com/watch?v=VIDEO_ID&t=754s)
[1:02:03](https://youtu.be/VIDEO_ID?t=3723)
```

The script should detect timestamp links without counting unrelated YouTube links too broadly.

If timestamp-link detection is too broad, refine it.

### 7. Red-flag detection

Check whether the red-flag regex catches useful revision markers without creating too many false positives.

Current intended examples include:

```text
TODO
FIXME
needs review
unclear
unknown
verify
verification needed
placeholder
timestamp needed
missing timestamp
not sure
unsure
```

If the repository uses other known markers, add them.

### 8. Duplicate question detection

Check whether duplicate question detection works with the real Markdown format.

It should normalize away:

- heading markers
- leading numbering
- extra whitespace
- case differences

It should not treat clearly different questions as duplicates.

### 9. Scoring model

Evaluate whether the revision score is useful.

Current intended scoring model:

```text
+100  missing MD
+80   missing TXT
+40   transcript over threshold and low question count
+30   low questions per 1,000 transcript words
+25   low MD words per 1,000 transcript words
+20   no timestamp links detected when questions exist
+15   red-flag wording detected
+10   duplicate question headings detected
+10   MD older than TXT
```

Check whether thresholds are reasonable for this repository:

```text
LargeTranscriptWordThreshold = 10000
LowQuestionCountThreshold = 20
LowQuestionsPerThousandWordsThreshold = 2.0
LowMdWordsPerThousandTxtWordsThreshold = 35.0
```

Do not overfit the thresholds. They only need to produce useful triage ordering.

### 10. Output files

Confirm the script writes:

```text
reports/question-revision-candidates.csv
reports/question-revision-candidates.md
```

Check that the CSV opens cleanly in spreadsheet tools.

Check that the Markdown report renders correctly and does not break when slugs or reasons contain pipe characters.

### 11. Sorting

Confirm the output is sorted by:

1. highest revision score first
2. episode number ascending where available
3. slug ascending as fallback

Check non-numbered livestream files and make sure they do not cause sort errors.

### 12. PowerShell quality

Check for common PowerShell issues:

- `Set-StrictMode -Version Latest` compatibility problems
- null-handling problems
- path problems on Windows
- `Resolve-Path -Relative` behavior
- regex escaping issues
- pipeline object bugs
- accidental scalar/array unwrapping
- encoding issues
- slow full-file reads on expected transcript sizes

Prefer PowerShell 7 behavior. Backward compatibility with Windows PowerShell 5.1 is not required.

## Validation Steps

Run the script against the repository if possible.

Then inspect:

```powershell
Import-Csv .\reports\question-revision-candidates.csv | Select-Object -First 20
```

Also inspect the Markdown report manually:

```text
reports/question-revision-candidates.md
```

If practical, run a few direct spot checks against specific files to confirm counts:

```powershell
(Get-Content .\src\transcripts\txt\<some-file>.txt).Count
(Get-Content .\docs\questions\<some-file>-questions.md).Count
```

Use better counting methods if needed, but make sure the script’s own results are internally consistent.

## Expected Deliverable

Make necessary fixes directly to the script.

Then provide a concise summary containing:

1. what was checked
2. bugs or weaknesses found
3. changes made
4. how to run the script
5. where the reports are generated
6. any remaining limitations or recommended follow-up improvements

## Constraints

- Keep the script simple and maintainable.
- Do not add external dependencies unless there is a clear benefit.
- Do not convert the script to Python unless PowerShell is clearly inadequate.
- Avoid broad rewrites if small targeted fixes are enough.
- Preserve the purpose: quick triage for determining which episodes need further revision.
