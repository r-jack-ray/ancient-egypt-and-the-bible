Set-StrictMode -Version Latest

function Resolve-QuestionRepositoryRoot {
    param(
        [string]$RepoRoot = ""
    )

    if (-not [string]::IsNullOrWhiteSpace($RepoRoot)) {
        $resolved = (Resolve-Path -LiteralPath $RepoRoot).Path
        if (
            (Test-Path -LiteralPath (Join-Path $resolved "docs/questions") -PathType Container) -and
            (Test-Path -LiteralPath (Join-Path $resolved "src/live-stream-list.md") -PathType Leaf)
        ) {
            return $resolved
        }

        throw "Repository root '$RepoRoot' does not contain docs/questions and src/live-stream-list.md."
    }

    $candidateStartPaths = @()
    if (-not [string]::IsNullOrWhiteSpace($PSScriptRoot)) {
        $candidateStartPaths += $PSScriptRoot
    }
    $candidateStartPaths += (Get-Location).Path

    foreach ($startPath in ($candidateStartPaths | Select-Object -Unique)) {
        $current = (Resolve-Path -LiteralPath $startPath).Path
        if (Test-Path -LiteralPath $current -PathType Leaf) {
            $current = Split-Path -Path $current -Parent
        }

        while ($current) {
            if (
                (Test-Path -LiteralPath (Join-Path $current "docs/questions") -PathType Container) -and
                (Test-Path -LiteralPath (Join-Path $current "src/live-stream-list.md") -PathType Leaf)
            ) {
                return $current
            }

            $parent = Split-Path -Path $current -Parent
            if ($parent -eq $current) {
                break
            }

            $current = $parent
        }
    }

    throw "Could not find repository root. Expected docs/questions and src/live-stream-list.md."
}

function Get-QuestionRepoRelativePath {
    param(
        [Parameter(Mandatory = $true)][string]$RepoRoot,
        [Parameter(Mandatory = $true)][string]$Path
    )

    return [System.IO.Path]::GetRelativePath($RepoRoot, $Path).Replace([System.IO.Path]::DirectorySeparatorChar, "/")
}

function Split-MarkdownTableRowStrict {
    param(
        [Parameter(Mandatory = $true)][string]$Line
    )

    $trimmed = $Line.Trim()
    if (-not $trimmed.StartsWith("|") -or -not $trimmed.EndsWith("|")) {
        throw "Line is not a complete Markdown table row."
    }

    $body = $trimmed.Substring(1, $trimmed.Length - 2)
    $cells = New-Object System.Collections.Generic.List[string]
    $current = New-Object System.Text.StringBuilder
    $escaped = $false

    foreach ($char in $body.ToCharArray()) {
        if ($escaped) {
            [void]$current.Append($char)
            $escaped = $false
            continue
        }

        if ($char -eq "\") {
            [void]$current.Append($char)
            $escaped = $true
            continue
        }

        if ($char -eq "|") {
            $cells.Add($current.ToString().Trim())
            [void]$current.Clear()
            continue
        }

        [void]$current.Append($char)
    }

    $cells.Add($current.ToString().Trim())
    return $cells.ToArray()
}

function Test-MarkdownDividerCell {
    param(
        [Parameter(Mandatory = $true)][string]$Cell
    )

    return $Cell -match '^:?-{3,}:?$'
}

function Convert-QuestionTimeLabelToSeconds {
    param(
        [Parameter(Mandatory = $true)][string]$Label
    )

    $parts = $Label.Split(":")
    if ($parts.Count -lt 2 -or $parts.Count -gt 3) {
        throw "Timestamp label '$Label' is not M:SS or H:MM:SS."
    }

    foreach ($part in $parts) {
        if ($part -notmatch '^\d+$') {
            throw "Timestamp label '$Label' contains a non-numeric part."
        }
    }

    if ($parts.Count -eq 2) {
        return ([int]$parts[0] * 60) + [int]$parts[1]
    }

    return ([int]$parts[0] * 3600) + ([int]$parts[1] * 60) + [int]$parts[2]
}

function Test-OrdinaryQuestionHeader {
    param(
        [Parameter(Mandatory = $true)][string[]]$Cells
    )

    if ($Cells.Count -eq 3) {
        return (
            $Cells[0] -eq "Time" -and
            $Cells[1] -eq "Question" -and
            $Cells[2] -eq "Short answer / answer direction"
        )
    }

    if ($Cells.Count -eq 4) {
        return (
            $Cells[0] -eq "Time" -and
            $Cells[1] -eq "Question" -and
            $Cells[2] -eq "Short answer / answer direction" -and
            $Cells[3] -eq "Expanded answer"
        )
    }

    return $false
}

function Get-QuestionTableAnalysis {
    param(
        [Parameter(Mandatory = $true)][string]$Path,
        [Parameter(Mandatory = $true)][string]$RepoRoot,
        [switch]$RequireExpandedAnswer
    )

    $lines = Get-Content -LiteralPath $Path
    $relativePath = Get-QuestionRepoRelativePath -RepoRoot $RepoRoot -Path $Path
    $errors = New-Object System.Collections.Generic.List[string]
    $warnings = New-Object System.Collections.Generic.List[string]
    $headerLineIndex = -1
    $headerCells = @()
    $tableLikeLineCount = 0

    for ($i = 0; $i -lt $lines.Count; $i++) {
        $line = [string]$lines[$i]
        if ($line.TrimStart().StartsWith("|")) {
            $tableLikeLineCount++
            try {
                $cells = Split-MarkdownTableRowStrict -Line $line
                if (Test-OrdinaryQuestionHeader -Cells $cells) {
                    $headerLineIndex = $i
                    $headerCells = $cells
                    break
                }
            }
            catch {
                $errors.Add("${relativePath}:$($i + 1) $($_.Exception.Message)")
            }
        }
    }

    if ($headerLineIndex -lt 0) {
        $classification = if ($errors.Count -gt 0 -or $tableLikeLineCount -gt 0) { "malformed" } else { "specialFormat" }
        return [pscustomobject][ordered]@{
            file = $relativePath
            classification = $classification
            headerLine = $null
            headerColumns = 0
            rowCount = 0
            pendingExpandedAnswers = 0
            completedExpandedAnswers = 0
            emptyExpandedAnswers = 0
            hardErrors = $errors.ToArray()
            warnings = $warnings.ToArray()
        }
    }

    $expectedColumns = $headerCells.Count
    $classification = if ($expectedColumns -eq 4) { "ordinaryFourColumn" } else { "ordinaryThreeColumn" }

    if ($RequireExpandedAnswer -and $expectedColumns -ne 4) {
        $errors.Add("${relativePath}:$($headerLineIndex + 1) has $expectedColumns columns; expected 4 with Expanded answer.")
    }

    $dividerLineIndex = $headerLineIndex + 1
    if ($dividerLineIndex -ge $lines.Count) {
        $errors.Add("${relativePath}:$($dividerLineIndex + 1) is missing the table divider row.")
    }
    else {
        try {
            $dividerCells = Split-MarkdownTableRowStrict -Line ([string]$lines[$dividerLineIndex])
            if ($dividerCells.Count -ne $expectedColumns) {
                $errors.Add("${relativePath}:$($dividerLineIndex + 1) has $($dividerCells.Count) divider cells; expected $expectedColumns.")
            }
            foreach ($cell in $dividerCells) {
                if (-not (Test-MarkdownDividerCell -Cell $cell)) {
                    $errors.Add("${relativePath}:$($dividerLineIndex + 1) has invalid divider cell '$cell'.")
                }
            }
        }
        catch {
            $errors.Add("${relativePath}:$($dividerLineIndex + 1) $($_.Exception.Message)")
        }
    }

    $rowCount = 0
    $pendingExpandedAnswers = 0
    $completedExpandedAnswers = 0
    $emptyExpandedAnswers = 0
    $startedRows = $false

    for ($i = $headerLineIndex + 2; $i -lt $lines.Count; $i++) {
        $line = [string]$lines[$i]

        if ([string]::IsNullOrWhiteSpace($line)) {
            break
        }

        if (-not $line.TrimStart().StartsWith("|")) {
            if (-not $startedRows) {
                $errors.Add("${relativePath}:$($i + 1) appears before any Q&A data rows.")
            }
            break
        }

        $startedRows = $true
        $rowCount++

        try {
            $cells = Split-MarkdownTableRowStrict -Line $line
        }
        catch {
            $errors.Add("${relativePath}:$($i + 1) $($_.Exception.Message)")
            continue
        }

        if ($cells.Count -ne $expectedColumns) {
            $errors.Add("${relativePath}:$($i + 1) has $($cells.Count) cells; expected $expectedColumns.")
            continue
        }

        $timeCell = $cells[0]
        $questionCell = $cells[1]
        $shortAnswerCell = $cells[2]

        if ([string]::IsNullOrWhiteSpace($questionCell)) {
            $errors.Add("${relativePath}:$($i + 1) has an empty question cell.")
        }

        if ([string]::IsNullOrWhiteSpace($shortAnswerCell)) {
            $errors.Add("${relativePath}:$($i + 1) has an empty short-answer cell.")
        }

        if ($timeCell -notmatch '<a\s+href="(?<href>https://(?:youtu\.be/[^"?]+|www\.youtube\.com/watch\?[^"]+)[^"]*[?&]t=(?<seconds>\d+)[^"]*)"\s+target="_blank"\s+rel="noopener noreferrer">(?<label>[^<]+)</a>') {
            $errors.Add("${relativePath}:$($i + 1) has a malformed timestamp anchor.")
        }
        else {
            try {
                $labelSeconds = Convert-QuestionTimeLabelToSeconds -Label $Matches.label
                if ($labelSeconds -ne [int]$Matches.seconds) {
                    $errors.Add("${relativePath}:$($i + 1) timestamp label '$($Matches.label)' does not match ?t=$($Matches.seconds).")
                }
            }
            catch {
                $errors.Add("${relativePath}:$($i + 1) $($_.Exception.Message)")
            }
        }

        if ($expectedColumns -eq 4) {
            $expandedAnswerCell = $cells[3]
            if ([string]::IsNullOrWhiteSpace($expandedAnswerCell)) {
                $emptyExpandedAnswers++
                $errors.Add("${relativePath}:$($i + 1) has an empty expanded-answer cell.")
            }
            elseif ($expandedAnswerCell -match '_Expansion pending\._') {
                $pendingExpandedAnswers++
                if ($RequireExpandedAnswer) {
                    $errors.Add("${relativePath}:$($i + 1) has a pending expanded-answer placeholder.")
                }
            }
            else {
                $completedExpandedAnswers++
                if ($expandedAnswerCell -eq $shortAnswerCell) {
                    $warnings.Add("${relativePath}:$($i + 1) expanded answer is identical to the short answer.")
                }
                elseif ($expandedAnswerCell.Length -lt $shortAnswerCell.Length) {
                    $warnings.Add("${relativePath}:$($i + 1) expanded answer is shorter than the short answer.")
                }
            }
        }
    }

    if ($rowCount -eq 0) {
        $errors.Add("${relativePath}:$($headerLineIndex + 1) has no Q&A data rows.")
    }

    if ($errors.Count -gt 0) {
        $classification = "malformed"
    }

    return [pscustomobject][ordered]@{
        file = $relativePath
        classification = $classification
        headerLine = $headerLineIndex + 1
        headerColumns = $expectedColumns
        rowCount = $rowCount
        pendingExpandedAnswers = $pendingExpandedAnswers
        completedExpandedAnswers = $completedExpandedAnswers
        emptyExpandedAnswers = $emptyExpandedAnswers
        hardErrors = $errors.ToArray()
        warnings = $warnings.ToArray()
    }
}

function Write-QuestionReportFiles {
    param(
        [Parameter(Mandatory = $true)][object]$Report,
        [Parameter(Mandatory = $true)][string]$JsonPath,
        [Parameter(Mandatory = $true)][string]$MarkdownPath,
        [Parameter(Mandatory = $true)][AllowEmptyString()][string[]]$MarkdownLines
    )

    $outputDir = Split-Path -Path $JsonPath -Parent
    if (-not (Test-Path -LiteralPath $outputDir)) {
        New-Item -ItemType Directory -Path $outputDir | Out-Null
    }

    $Report | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath $JsonPath -Encoding utf8
    Set-Content -LiteralPath $MarkdownPath -Value $MarkdownLines -Encoding utf8
}
