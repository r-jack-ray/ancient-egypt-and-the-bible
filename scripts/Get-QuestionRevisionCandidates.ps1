<#
.SYNOPSIS
    Analyzes transcript TXT files and processed question MD files to estimate which episodes need further revision.

.DESCRIPTION
    Compares files in:
      - docs/questions
      - src/transcripts/txt

    Produces:
      - CSV report
      - Markdown summary report

    Main triage signals:
      - Missing MD or TXT pair
      - Low question density
      - Low MD-to-transcript word ratio
      - Nonstandard table shape
      - Missing timestamp links on question rows
      - Missing or pending expanded answers
      - Editorial repair markers
      - Duplicate question text
      - MD older than transcript

    The score is a triage aid, not proof of an error. Transcript-grounded
    uncertainty words such as "unknown" or "not sure" are not repair markers.

.NOTES
    Designed for PowerShell 7+.
#>

[CmdletBinding()]
param(
    [string]$RepoRoot = "",

    [string]$QuestionsDir = "docs/questions",

    [string]$TranscriptsDir = "src/transcripts/txt",

    [string]$OutputDir = "reports",

    [string]$CsvName = "question-revision-candidates.csv",

    [string]$MarkdownName = "question-revision-candidates.md",

    [int]$LargeTranscriptWordThreshold = 10000,

    [int]$LowQuestionCountThreshold = 20,

    [double]$LowQuestionsPerThousandWordsThreshold = 2.0,

    [double]$LowMdWordsPerThousandTxtWordsThreshold = 35.0,

    [switch]$ScoreSpecialEpisodeDensity
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$questionTableToolsPath = Join-Path $PSScriptRoot "QuestionTableTools.ps1"
if (-not (Test-Path -LiteralPath $questionTableToolsPath -PathType Leaf)) {
    throw "Required helper not found: $questionTableToolsPath"
}
. $questionTableToolsPath

function Resolve-RepositoryRoot {
    param(
        [Parameter(Mandatory)]
        [string]$StartPath
    )

    $current = (Resolve-Path -LiteralPath $StartPath).Path

    if (Test-Path -LiteralPath $current -PathType Leaf) {
        $current = Split-Path -Path $current -Parent
    }

    while ($current) {
        $questionsCandidate = Join-Path $current "docs/questions"
        $transcriptsCandidate = Join-Path $current "src/transcripts/txt"

        if (
            (Test-Path -LiteralPath $questionsCandidate -PathType Container) -and
            (Test-Path -LiteralPath $transcriptsCandidate -PathType Container)
        ) {
            return $current
        }

        $parent = Split-Path -Path $current -Parent
        if ($parent -eq $current) {
            break
        }

        $current = $parent
    }

    throw "Could not find repository root from '$StartPath'. Expected docs/questions and src/transcripts/txt."
}

function Resolve-DefaultRepositoryRoot {
    $candidateStartPaths = @()

    if (-not [string]::IsNullOrWhiteSpace($PSScriptRoot)) {
        $candidateStartPaths += $PSScriptRoot
    }

    $candidateStartPaths += (Get-Location).Path

    foreach ($startPath in ($candidateStartPaths | Select-Object -Unique)) {
        try {
            return Resolve-RepositoryRoot -StartPath $startPath
        }
        catch {
            continue
        }
    }

    throw "Could not find repository root from the current location or script path. Expected docs/questions and src/transcripts/txt."
}

$repoRootPath = if ([string]::IsNullOrWhiteSpace($RepoRoot)) {
    Resolve-DefaultRepositoryRoot
}
else {
    (Resolve-Path -LiteralPath $RepoRoot).Path
}

$questionsPath = Join-Path $repoRootPath $QuestionsDir
$transcriptsPath = Join-Path $repoRootPath $TranscriptsDir
$outputPath = Join-Path $repoRootPath $OutputDir
$csvPath = Join-Path $outputPath $CsvName
$markdownPath = Join-Path $outputPath $MarkdownName

if (-not (Test-Path -LiteralPath $questionsPath)) {
    throw "Questions directory not found: $questionsPath"
}

if (-not (Test-Path -LiteralPath $transcriptsPath)) {
    throw "Transcripts directory not found: $transcriptsPath"
}

if (-not (Test-Path -LiteralPath $outputPath)) {
    New-Item -ItemType Directory -Path $outputPath | Out-Null
}

function Get-BaseSlug {
    param(
        [Parameter(Mandatory)]
        [System.IO.FileInfo]$File
    )

    return [System.IO.Path]::GetFileNameWithoutExtension($File.Name)
}

function Get-NormalizedMarkdownSlug {
    param(
        [Parameter(Mandatory)]
        [System.IO.FileInfo]$File,

        [Parameter(Mandatory)]
        [hashtable]$KnownTranscriptSlugs
    )

    $baseSlug = Get-BaseSlug -File $File

    if ($KnownTranscriptSlugs.ContainsKey($baseSlug)) {
        return $baseSlug
    }

    if ($baseSlug -match '^(?<slug>.+)-questions$') {
        $withoutQuestionsSuffix = $Matches.slug

        if ($KnownTranscriptSlugs.ContainsKey($withoutQuestionsSuffix)) {
            return $withoutQuestionsSuffix
        }

        return $withoutQuestionsSuffix
    }

    return $baseSlug
}

function Add-FileToSlugIndex {
    param(
        [Parameter(Mandatory)]
        [hashtable]$Index,

        [Parameter(Mandatory)]
        [string]$Slug,

        [Parameter(Mandatory)]
        [System.IO.FileInfo]$File
    )

    if (-not $Index.ContainsKey($Slug)) {
        $Index[$Slug] = New-Object System.Collections.Generic.List[System.IO.FileInfo]
    }

    $Index[$Slug].Add($File)
}

function Get-FirstIndexedFile {
    param(
        [hashtable]$Index,
        [string]$Slug
    )

    if (-not $Index.ContainsKey($Slug)) {
        return $null
    }

    return @($Index[$Slug] | Sort-Object FullName)[0]
}

function Get-RepoRelativePath {
    param(
        [System.IO.FileInfo]$File
    )

    if ($null -eq $File) {
        return ""
    }

    return [System.IO.Path]::GetRelativePath($repoRootPath, $File.FullName).Replace([System.IO.Path]::DirectorySeparatorChar, "/")
}

function Get-EpisodeNumber {
    param(
        [Parameter(Mandatory)]
        [string]$Slug
    )

    if ($Slug -match '^(\d+)') {
        return [int]$Matches[1]
    }

    return $null
}

function Get-TriageCategory {
    param(
        [Parameter(Mandatory)]
        [string]$Slug
    )

    if ($Slug -match '(?i)d-and-d-special-live-stream$') {
        return "DAndDSpecial"
    }

    if ($Slug -match '(?i)(^special-live-stream-|-open-room-special$)') {
        return "Special"
    }

    return "Ordinary"
}

function Test-DensityScoringSkipped {
    param(
        [Parameter(Mandatory)]
        [string]$TriageCategory
    )

    return (-not $ScoreSpecialEpisodeDensity) -and ($TriageCategory -ne "Ordinary")
}

function Get-TextStats {
    param(
        [System.IO.FileInfo]$File
    )

    if ($null -eq $File -or -not $File.Exists) {
        return [pscustomobject]@{
            Exists          = $false
            LineCount       = 0
            WordCount       = 0
            SizeBytes       = 0
            SizeKB          = 0
            LastWriteTime   = $null
            Text            = ""
        }
    }

    $text = [System.IO.File]::ReadAllText($File.FullName)

    $lineCount = if ($text.Length -eq 0) {
        0
    }
    else {
        $newlineCount = [regex]::Matches($text, "\r\n|\n|\r").Count
        if ($text -match "(\r\n|\n|\r)$") {
            $newlineCount
        }
        else {
            $newlineCount + 1
        }
    }

    $wordPattern = "[\p{L}\p{N}][\p{L}\p{N}'’-]*"
    $wordCount = [regex]::Matches($text, $wordPattern).Count

    return [pscustomobject]@{
        Exists          = $true
        LineCount       = $lineCount
        WordCount       = $wordCount
        SizeBytes       = $File.Length
        SizeKB          = [math]::Round($File.Length / 1KB, 2)
        LastWriteTime   = $File.LastWriteTime
        Text            = $text
    }
}

function Test-MarkdownTimestampLink {
    param(
        [AllowEmptyString()]
        [string]$Text
    )

    $timestampPattern = "(?i)(?:<a\s+[^>]*href=[""'][^""']*(?:youtu\.be/|youtube\.com/watch\?)[^""']*(?:[?&]t=\d+s?)[^""']*[""'][^>]*>\s*\d{1,2}:\d{2}(?::\d{2})?\s*</a>|\[\d{1,2}:\d{2}(?::\d{2})?\]\([^)]*(?:youtu\.be/|youtube\.com/watch\?)[^)]*(?:[?&]t=\d+s?)[^)]*\))"
    return [regex]::IsMatch($Text, $timestampPattern)
}

function Get-MarkdownTimestampLinkCount {
    param(
        [AllowEmptyString()]
        [string]$Text
    )

    $timestampPattern = "(?i)(?:<a\s+[^>]*href=[""'][^""']*(?:youtu\.be/|youtube\.com/watch\?)[^""']*(?:[?&]t=\d+s?)[^""']*[""'][^>]*>\s*\d{1,2}:\d{2}(?::\d{2})?\s*</a>|\[\d{1,2}:\d{2}(?::\d{2})?\]\([^)]*(?:youtu\.be/|youtube\.com/watch\?)[^)]*(?:[?&]t=\d+s?)[^)]*\))"
    return [regex]::Matches($Text, $timestampPattern).Count
}

function Get-EditorialRepairMarkerCount {
    param(
        [AllowEmptyString()]
        [string]$Text
    )

    # Keep this list to editor/workflow markers. Ordinary answers often need
    # words such as "unknown", "unclear", or "not sure" to preserve transcript
    # uncertainty, so those are intentionally excluded.
    $patterns = @(
        '(?im)\bTODO\b',
        '(?im)\bFIXME\b',
        '(?im)\bTBD\b',
        '(?m)(?<!\w)TK(?!\w)',
        '(?i)\bneeds review\b',
        '(?i)\bverification needed\b',
        '(?i)\btimestamp needed\b',
        '(?i)\bmissing timestamp\b',
        '(?i)\bcitation needed\b',
        '(?i)\btranscript needed\b',
        '(?i)\bcheck transcript\b',
        '(?i)_Expansion pending\._',
        '(?m)\bPLACEHOLDER\b'
    )

    $count = 0
    foreach ($pattern in $patterns) {
        $count += [regex]::Matches($Text, $pattern).Count
    }

    return $count
}

function ConvertTo-NormalizedQuestionText {
    param(
        [AllowEmptyString()]
        [string]$Text
    )

    if ($null -eq $Text) {
        return ""
    }

    $q = $Text
    $q = $q -replace '<[^>]+>', ''
    $q = $q -replace '\[[^\]]+\]\([^)]+\)', ''
    $q = $q -replace "^\s{0,3}#{2,6}\s+", ""
    $q = $q -replace "^\s{0,3}[-*]\s+", ""
    $q = $q -replace "^\d+[\.\)]\s*", ""
    $q = $q -replace "\\\|", "|"
    $q = $q -replace "\s+", " "
    return $q.Trim().ToLowerInvariant()
}

function ConvertTo-MarkdownTableCell {
    param(
        [AllowNull()]
        [object]$Value
    )

    if ($null -eq $Value) {
        return ""
    }

    $text = [string]$Value
    $text = $text -replace "\r\n|\n|\r", " "
    return $text.Replace("|", "\|")
}

function New-EmptyMdQualityStats {
    return [pscustomobject]@{
        OrdinaryTableDetected       = $false
        TableHeaderColumnCount      = 0
        QuestionCount               = 0
        TimestampLinkCount          = 0
        MissingTimestampLinkCount   = 0
        MalformedTableRowCount      = 0
        LegacyThreeColumnTable      = $false
        PendingExpandedAnswerCount  = 0
        EmptyExpandedAnswerCount    = 0
        MissingExpandedAnswerCount  = 0
        CompletedExpandedAnswerCount = 0
        RedFlagCount                = 0
        DuplicateQuestionCount      = 0
        DuplicateQuestionSamples    = ""
    }
}

function Get-MdQualityStats {
    param(
        [AllowEmptyString()]
        [string]$Text
    )

    $stats = New-EmptyMdQualityStats

    if ([string]::IsNullOrWhiteSpace($Text)) {
        return $stats
    }

    $questionTexts = New-Object System.Collections.Generic.List[string]
    $lines = $Text -split "\r\n|\n|\r"

    for ($i = 0; $i -lt $lines.Count; $i++) {
        $trimmed = ([string]$lines[$i]).Trim()

        if (-not ($trimmed.StartsWith("|") -and $trimmed.EndsWith("|"))) {
            continue
        }

        try {
            $headerCells = @(Split-MarkdownTableRowStrict -Line $trimmed)
        }
        catch {
            continue
        }

        if (-not (Test-OrdinaryQuestionHeader -Cells $headerCells)) {
            continue
        }

        $stats.OrdinaryTableDetected = $true
        $stats.TableHeaderColumnCount = $headerCells.Count
        $stats.LegacyThreeColumnTable = $headerCells.Count -eq 3
        $expectedColumnCount = $headerCells.Count

        $dividerLineIndex = $i + 1
        if ($dividerLineIndex -ge $lines.Count) {
            $stats.MalformedTableRowCount++
        }
        else {
            try {
                $dividerCells = @(Split-MarkdownTableRowStrict -Line ([string]$lines[$dividerLineIndex]))
                if ($dividerCells.Count -ne $expectedColumnCount) {
                    $stats.MalformedTableRowCount++
                }
                elseif (@($dividerCells | Where-Object { -not (Test-MarkdownDividerCell -Cell $_) }).Count -gt 0) {
                    $stats.MalformedTableRowCount++
                }
            }
            catch {
                $stats.MalformedTableRowCount++
            }
        }

        for ($j = $i + 2; $j -lt $lines.Count; $j++) {
            $line = [string]$lines[$j]

            if ([string]::IsNullOrWhiteSpace($line)) {
                break
            }

            $rowText = $line.Trim()
            if (-not ($rowText.StartsWith("|") -and $rowText.EndsWith("|"))) {
                break
            }

            try {
                $cells = @(Split-MarkdownTableRowStrict -Line $rowText)
            }
            catch {
                $stats.MalformedTableRowCount++
                continue
            }

            if ($cells.Count -ne $expectedColumnCount) {
                $stats.MalformedTableRowCount++
                continue
            }

            $timeCell = $cells[0].Trim()
            $questionCell = $cells[1].Trim()
            $shortAnswerCell = $cells[2].Trim()

            if ([string]::IsNullOrWhiteSpace($questionCell)) {
                $stats.MalformedTableRowCount++
                continue
            }

            $questionTexts.Add($questionCell)

            if (Test-MarkdownTimestampLink -Text $timeCell) {
                $stats.TimestampLinkCount++
            }

            if ($expectedColumnCount -eq 3) {
                $stats.MissingExpandedAnswerCount++
            }
            elseif ($expectedColumnCount -eq 4) {
                $expandedAnswerCell = $cells[3].Trim()

                if ([string]::IsNullOrWhiteSpace($expandedAnswerCell)) {
                    $stats.EmptyExpandedAnswerCount++
                }
                elseif ($expandedAnswerCell -match '_Expansion pending\._') {
                    $stats.PendingExpandedAnswerCount++
                }
                else {
                    $stats.CompletedExpandedAnswerCount++
                }
            }
        }

        break
    }

    if (-not $stats.OrdinaryTableDetected) {
        $fallbackQuestionPattern = "(?im)^\s{0,3}(?:#{2,6}\s+|[-*]\s+|\d+[\.\)]\s+).+\?\s*$"
        foreach ($match in [regex]::Matches($Text, $fallbackQuestionPattern)) {
            $questionText = $match.Value
            $questionText = $questionText -replace "^\s{0,3}#{2,6}\s+", ""
            $questionText = $questionText -replace "^\s{0,3}[-*]\s+", ""
            $questionText = $questionText -replace "^\s{0,3}\d+[\.\)]\s+", ""
            $questionTexts.Add($questionText.Trim())
        }

        $stats.TimestampLinkCount = Get-MarkdownTimestampLinkCount -Text $Text
    }

    $stats.QuestionCount = $questionTexts.Count
    if ($stats.QuestionCount -gt $stats.TimestampLinkCount) {
        $stats.MissingTimestampLinkCount = $stats.QuestionCount - $stats.TimestampLinkCount
    }

    $stats.RedFlagCount = Get-EditorialRepairMarkerCount -Text $Text

    $normalizedQuestions = foreach ($questionText in $questionTexts) {
        ConvertTo-NormalizedQuestionText -Text $questionText
    }

    $duplicates = $normalizedQuestions |
        Where-Object { -not [string]::IsNullOrWhiteSpace($_) } |
        Group-Object |
        Where-Object { $_.Count -gt 1 } |
        Sort-Object Count -Descending

    $duplicateQuestionCount = 0
    foreach ($duplicate in $duplicates) {
        $duplicateQuestionCount += ($duplicate.Count - 1)
    }

    $duplicateSamples = ($duplicates |
        Select-Object -First 3 |
        ForEach-Object { "$($_.Count)x $($_.Name)" }) -join "; "

    $stats.DuplicateQuestionCount = $duplicateQuestionCount
    $stats.DuplicateQuestionSamples = $duplicateSamples

    return $stats
}

$mdFiles = Get-ChildItem -LiteralPath $questionsPath -Filter "*.md" -File
$txtFiles = Get-ChildItem -LiteralPath $transcriptsPath -Filter "*.txt" -File

$txtBySlug = @{}
foreach ($file in $txtFiles) {
    $slug = Get-BaseSlug -File $file
    Add-FileToSlugIndex -Index $txtBySlug -Slug $slug -File $file
}

$mdBySlug = @{}
foreach ($file in $mdFiles) {
    $slug = Get-NormalizedMarkdownSlug -File $file -KnownTranscriptSlugs $txtBySlug
    Add-FileToSlugIndex -Index $mdBySlug -Slug $slug -File $file
}

$allSlugs = @(
    $mdBySlug.Keys
    $txtBySlug.Keys
) | Sort-Object -Unique

$results = foreach ($slug in $allSlugs) {
    [System.IO.FileInfo[]]$mdFilesForSlug = if ($mdBySlug.ContainsKey($slug)) { @($mdBySlug[$slug]) } else { @() }
    [System.IO.FileInfo[]]$txtFilesForSlug = if ($txtBySlug.ContainsKey($slug)) { @($txtBySlug[$slug]) } else { @() }
    $mdFile = Get-FirstIndexedFile -Index $mdBySlug -Slug $slug
    $txtFile = Get-FirstIndexedFile -Index $txtBySlug -Slug $slug
    $triageCategory = Get-TriageCategory -Slug $slug
    $densityScoringSkipped = Test-DensityScoringSkipped -TriageCategory $triageCategory

    $mdStats = Get-TextStats -File $mdFile
    $txtStats = Get-TextStats -File $txtFile
    $qualityStats = Get-MdQualityStats -Text $mdStats.Text

    $score = 0
    $reasons = @()

    if (-not $mdStats.Exists) {
        $score += 100
        $reasons += "Missing MD"
    }

    if (-not $txtStats.Exists) {
        $score += 80
        $reasons += "Missing TXT"
    }

    if ($mdFilesForSlug.Count -gt 1) {
        $score += 80
        $reasons += "Duplicate MD slug"
    }

    if ($txtFilesForSlug.Count -gt 1) {
        $score += 80
        $reasons += "Duplicate TXT slug"
    }

    $questionsPer1000Words = if ($txtStats.WordCount -gt 0) {
        [math]::Round(($qualityStats.QuestionCount / $txtStats.WordCount) * 1000, 3)
    }
    else {
        0
    }

    $mdWordsPer1000TxtWords = if ($txtStats.WordCount -gt 0) {
        [math]::Round(($mdStats.WordCount / $txtStats.WordCount) * 1000, 3)
    }
    else {
        0
    }

    $mdLinesPer1000TxtLines = if ($txtStats.LineCount -gt 0) {
        [math]::Round(($mdStats.LineCount / $txtStats.LineCount) * 1000, 3)
    }
    else {
        0
    }

    if ($txtStats.Exists -and $mdStats.Exists) {
        if ($qualityStats.MalformedTableRowCount -gt 0) {
            $score += 70
            $reasons += "Malformed question table rows"
        }

        if ($qualityStats.LegacyThreeColumnTable) {
            $score += 55
            $reasons += "Legacy three-column question table"
        }

        if ($qualityStats.PendingExpandedAnswerCount -gt 0) {
            $score += 55
            $reasons += "Pending expanded-answer placeholders"
        }

        if ($qualityStats.EmptyExpandedAnswerCount -gt 0) {
            $score += 55
            $reasons += "Empty expanded-answer cells"
        }

        if (-not $densityScoringSkipped) {
            if ($txtStats.WordCount -ge $LargeTranscriptWordThreshold -and $qualityStats.QuestionCount -lt $LowQuestionCountThreshold) {
                $score += 40
                $reasons += "Large transcript with low question count"
            }

            if ($questionsPer1000Words -gt 0 -and $questionsPer1000Words -lt $LowQuestionsPerThousandWordsThreshold) {
                $score += 30
                $reasons += "Low questions per 1,000 transcript words"
            }

            if ($mdWordsPer1000TxtWords -gt 0 -and $mdWordsPer1000TxtWords -lt $LowMdWordsPerThousandTxtWordsThreshold) {
                $score += 25
                $reasons += "Low MD words per 1,000 transcript words"
            }
        }

        if ($qualityStats.QuestionCount -gt 0 -and $qualityStats.MissingTimestampLinkCount -gt 0) {
            if ($qualityStats.TimestampLinkCount -eq 0) {
                $score += 20
                $reasons += "No timestamp links detected"
            }
            else {
                $score += 15
                $reasons += "Some question rows lack timestamp links"
            }
        }

        if ($qualityStats.RedFlagCount -gt 0) {
            $score += 15
            $reasons += "Editorial repair marker detected"
        }

        if ($qualityStats.DuplicateQuestionCount -gt 0) {
            $score += 10
            $reasons += "Duplicate question text detected"
        }

        if ($mdStats.LastWriteTime -lt $txtStats.LastWriteTime) {
            $score += 10
            $reasons += "MD older than TXT"
        }
    }

    $priority = switch ($score) {
        { $_ -ge 100 } { "Critical"; break }
        { $_ -ge 70 }  { "High"; break }
        { $_ -ge 35 }  { "Medium"; break }
        { $_ -gt 0 }   { "Low"; break }
        default        { "OK" }
    }

    [pscustomobject]@{
        EpisodeNumber                 = Get-EpisodeNumber -Slug $slug
        Slug                          = $slug
        TriageCategory                = $triageCategory
        DensityScoringSkipped         = [bool]$densityScoringSkipped
        Priority                      = $priority
        RevisionScore                 = $score
        Reasons                       = ($reasons -join "; ")

        MdExists                      = $mdStats.Exists
        TxtExists                     = $txtStats.Exists

        MdFile                        = Get-RepoRelativePath -File $mdFile
        TxtFile                       = Get-RepoRelativePath -File $txtFile
        MdDuplicateFiles              = ($mdFilesForSlug | Sort-Object FullName | ForEach-Object { Get-RepoRelativePath -File $_ }) -join "; "
        TxtDuplicateFiles             = ($txtFilesForSlug | Sort-Object FullName | ForEach-Object { Get-RepoRelativePath -File $_ }) -join "; "

        MdLineCount                   = $mdStats.LineCount
        TxtLineCount                  = $txtStats.LineCount
        MdWordCount                   = $mdStats.WordCount
        TxtWordCount                  = $txtStats.WordCount
        TxtSizeKB                     = $txtStats.SizeKB

        OrdinaryTableDetected         = $qualityStats.OrdinaryTableDetected
        TableHeaderColumnCount        = $qualityStats.TableHeaderColumnCount
        MalformedTableRowCount        = $qualityStats.MalformedTableRowCount
        LegacyThreeColumnTable        = $qualityStats.LegacyThreeColumnTable
        QuestionCount                 = $qualityStats.QuestionCount
        TimestampLinkCount            = $qualityStats.TimestampLinkCount
        MissingTimestampLinkCount     = $qualityStats.MissingTimestampLinkCount
        MissingExpandedAnswerCount    = $qualityStats.MissingExpandedAnswerCount
        PendingExpandedAnswerCount    = $qualityStats.PendingExpandedAnswerCount
        EmptyExpandedAnswerCount      = $qualityStats.EmptyExpandedAnswerCount
        CompletedExpandedAnswerCount  = $qualityStats.CompletedExpandedAnswerCount
        RedFlagCount                  = $qualityStats.RedFlagCount
        DuplicateQuestionCount        = $qualityStats.DuplicateQuestionCount
        DuplicateQuestionSamples      = $qualityStats.DuplicateQuestionSamples

        QuestionsPer1000TxtWords      = $questionsPer1000Words
        MdWordsPer1000TxtWords        = $mdWordsPer1000TxtWords
        MdLinesPer1000TxtLines        = $mdLinesPer1000TxtLines

        MdLastWriteTime               = $mdStats.LastWriteTime
        TxtLastWriteTime              = $txtStats.LastWriteTime
    }
}

$sortedResults = $results |
    Sort-Object `
        @{ Expression = "RevisionScore"; Descending = $true },
        @{ Expression = { if ($null -eq $_.EpisodeNumber) { [int]::MaxValue } else { $_.EpisodeNumber } }; Ascending = $true },
        @{ Expression = "Slug"; Ascending = $true }

$sortedResults |
    Export-Csv -LiteralPath $csvPath -NoTypeInformation -Encoding UTF8

$critical = @($sortedResults | Where-Object Priority -eq "Critical")
$high = @($sortedResults | Where-Object Priority -eq "High")
$medium = @($sortedResults | Where-Object Priority -eq "Medium")
$low = @($sortedResults | Where-Object Priority -eq "Low")
$ok = @($sortedResults | Where-Object Priority -eq "OK")
$densitySkipped = @($sortedResults | Where-Object DensityScoringSkipped)

$markdown = New-Object System.Collections.Generic.List[string]

$markdown.Add("# Question Revision Candidate Report")
$markdown.Add("")
$markdown.Add("Generated: $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')")
$markdown.Add("")
$markdown.Add("## Summary")
$markdown.Add("")
$markdown.Add("| Priority | Count |")
$markdown.Add("|---|---:|")
$markdown.Add("| Critical | $($critical.Count) |")
$markdown.Add("| High | $($high.Count) |")
$markdown.Add("| Medium | $($medium.Count) |")
$markdown.Add("| Low | $($low.Count) |")
$markdown.Add("| OK | $($ok.Count) |")
$markdown.Add("")
$markdown.Add("CSV report: ``$CsvName``")
if ($densitySkipped.Count -gt 0) {
    $markdown.Add("")
    $markdown.Add("Density scoring skipped for $($densitySkipped.Count) special/D&D rows. Use ``-ScoreSpecialEpisodeDensity`` to include low-density scoring for those rows.")
}
$markdown.Add("")

$markdown.Add("## Top Revision Candidates")
$markdown.Add("")
$markdown.Add("| Score | Priority | Episode | Category | Slug | Questions | Timestamp links | Expanded issues | TXT Words | Q / 1k TXT Words | MD Words / 1k TXT Words | Reasons |")
$markdown.Add("|---:|---|---:|---|---|---:|---:|---:|---:|---:|---:|---|")

foreach ($row in ($sortedResults | Select-Object -First 50)) {
    $episode = if ($null -ne $row.EpisodeNumber) { $row.EpisodeNumber } else { "" }
    $expandedIssues = $row.MissingExpandedAnswerCount + $row.PendingExpandedAnswerCount + $row.EmptyExpandedAnswerCount
    $safeReasons = ConvertTo-MarkdownTableCell -Value $row.Reasons
    $safeSlug = ConvertTo-MarkdownTableCell -Value $row.Slug
    $safeCategory = ConvertTo-MarkdownTableCell -Value $row.TriageCategory

    $markdown.Add("| $($row.RevisionScore) | $($row.Priority) | $episode | $safeCategory | $safeSlug | $($row.QuestionCount) | $($row.TimestampLinkCount) | $expandedIssues | $($row.TxtWordCount) | $($row.QuestionsPer1000TxtWords) | $($row.MdWordsPer1000TxtWords) | $safeReasons |")
}

$markdown.Add("")
$markdown.Add("## Missing Pairs")
$markdown.Add("")

$missingRows = @($sortedResults | Where-Object { -not $_.MdExists -or -not $_.TxtExists })

if ($missingRows.Count -eq 0) {
    $markdown.Add("No missing MD/TXT pairs detected.")
}
else {
    $markdown.Add("| Priority | Episode | Slug | MD Exists | TXT Exists | Reasons |")
    $markdown.Add("|---|---:|---|---:|---:|---|")

    foreach ($row in $missingRows) {
        $episode = if ($null -ne $row.EpisodeNumber) { $row.EpisodeNumber } else { "" }
        $safeReasons = ConvertTo-MarkdownTableCell -Value $row.Reasons
        $safeSlug = ConvertTo-MarkdownTableCell -Value $row.Slug

        $markdown.Add("| $($row.Priority) | $episode | $safeSlug | $($row.MdExists) | $($row.TxtExists) | $safeReasons |")
    }
}

$markdown.Add("")
$markdown.Add("## Notes")
$markdown.Add("")
$markdown.Add("- The score is only a triage estimate.")
$markdown.Add("- Low question density does not prove the file is bad, but it can be a candidate for review on ordinary streams.")
$markdown.Add("- Special live streams and ETS D&D streams skip low-density scoring by default because their transcript structure is different.")
$markdown.Add("- Editorial repair markers exclude normal transcript-grounded uncertainty wording such as unknown, unclear, and not sure.")
$markdown.Add("- CSV output is the better file for sorting and filtering.")

$markdown | Set-Content -LiteralPath $markdownPath -Encoding UTF8

Write-Host "Revision report created:"
Write-Host "  CSV: $csvPath"
Write-Host "  MD : $markdownPath"
