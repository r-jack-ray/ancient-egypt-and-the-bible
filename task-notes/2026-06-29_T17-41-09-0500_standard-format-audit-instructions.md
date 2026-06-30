# Standard Format Audit Instructions

Timestamp: 2026-06-29T17:41:09-05:00

## Goal

Create a simple list of `docs/questions/*.md` files that do not fit the ordinary curated question-page table format and will need the same kind of format-only repair that was just done for `docs/questions/214-crud-slurping-egyptian-deities-questions.md`.

Do not repair the files in this pass unless the user explicitly asks for fixes. The requested output is only a list of nonstandard files and the reason each file was flagged.

## Standard Format

Use `docs/questions/1-the-debug-episode-questions.md` as the canonical example.

Ordinary question pages should have:

- Header row exactly: `| Time | Question | Short answer / answer direction |`
- Separator row exactly: `|---:|---|---|`
- Data rows where column 1 starts with a YouTube timestamp anchor:
  `<a href="https://youtu.be/VIDEO_ID?t=SECONDS" target="_blank" rel="noopener noreferrer">DISPLAY_TIME</a>`
- Exactly three table columns per row.
- No ordinary-page table in the old order `Question | Time | Answer`.

Special-purpose pages may be listed separately as "manual review" if their purpose clearly differs from ordinary full Q&A pages.

## Suggested Command

Run from `C:\Workspaces\ancient-egypt-and-the-bible`:

```powershell
$files = Get-ChildItem docs/questions -Filter *.md | Sort-Object Name
$results = foreach ($file in $files) {
    $lines = Get-Content $file.FullName
    $tableLines = $lines | Where-Object { $_ -match '^\|' }
    if (-not $tableLines) {
        [pscustomobject]@{ File = $file.Name; Reason = 'no Markdown table found' }
        continue
    }

    $header = $tableLines[0]
    $separator = if ($tableLines.Count -gt 1) { $tableLines[1] } else { '' }
    $dataRows = $tableLines | Select-Object -Skip 2
    $reasons = [System.Collections.Generic.List[string]]::new()

    if ($header -ne '| Time | Question | Short answer / answer direction |') {
        $reasons.Add("nonstandard header: $header")
    }
    if ($separator -ne '|---:|---|---|') {
        $reasons.Add("nonstandard separator: $separator")
    }
    foreach ($row in $tableLines) {
        $unescaped = ([regex]::Matches($row, '(?<!\\)\|')).Count
        if ($unescaped -ne 4) {
            $reasons.Add('row with wrong pipe count')
            break
        }
    }
    foreach ($row in $dataRows) {
        if ($row -and $row -notmatch '^\| <a href="https://youtu\.be/[^"]+\?t=\d+" target="_blank" rel="noopener noreferrer">[0-9:]+</a> \|') {
            $reasons.Add('data row does not start with timestamp anchor')
            break
        }
    }
    if ($lines -match '^\| Question \| Time \| Answer \|$') {
        $reasons.Add('old Question-Time-Answer order')
    }

    if ($reasons.Count -gt 0) {
        [pscustomobject]@{ File = $file.Name; Reason = ($reasons -join '; ') }
    }
}

$results | Format-Table -AutoSize
"Nonstandard file count: $($results.Count)"
```

## Expected Follow-Up

If the user asks to fix the listed files, normalize ordinary pages to the standard column order with timestamp links first. Keep content changes out of scope unless a row is structurally broken and cannot be reformatted safely.
