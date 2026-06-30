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

    Main scoring signals:
      - Missing MD or TXT pair
      - Low question density
      - Low MD-to-transcript word ratio
      - Missing timestamp links
      - Red-flag wording
      - Duplicate question headings
      - MD older than transcript

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

    [double]$LowMdWordsPerThousandTxtWordsThreshold = 35.0
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

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

    return [System.IO.Path]::GetRelativePath($repoRootPath, $File.FullName)
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

function Get-MdQualityStats {
    param(
        [string]$Text
    )

    if ([string]::IsNullOrWhiteSpace($Text)) {
        return [pscustomobject]@{
            QuestionCount            = 0
            TimestampLinkCount       = 0
            RedFlagCount             = 0
            DuplicateQuestionCount   = 0
            DuplicateQuestionSamples = ""
        }
    }

    $questionTexts = New-Object System.Collections.Generic.List[string]
    $lines = $Text -split "\r\n|\n|\r"

    foreach ($line in $lines) {
        $trimmed = $line.Trim()

        if ($trimmed -notmatch '^\|.*\|$') {
            continue
        }

        if ($trimmed -match '^\|\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?$') {
            continue
        }

        $cells = @($trimmed.Trim('|') -split '(?<!\\)\|')

        if ($cells.Count -lt 3) {
            continue
        }

        $timeCell = $cells[0].Trim()
        $questionCell = $cells[1].Trim()

        if ($questionCell -eq "" -or $questionCell -match '^(?i:question)$') {
            continue
        }

        if ($timeCell -match '(?i)(?:youtu\.be/|youtube\.com/watch\?).*(?:[?&]t=\d+s?)') {
            $questionTexts.Add($questionCell)
        }
    }

    if ($questionTexts.Count -eq 0) {
        $fallbackQuestionPattern = "(?im)^\s{0,3}(?:#{2,6}\s+|[-*]\s+|\d+[\.\)]\s+).+\?\s*$"
        foreach ($match in [regex]::Matches($Text, $fallbackQuestionPattern)) {
            $questionText = $match.Value
            $questionText = $questionText -replace "^\s{0,3}#{2,6}\s+", ""
            $questionText = $questionText -replace "^\s{0,3}[-*]\s+", ""
            $questionText = $questionText -replace "^\s{0,3}\d+[\.\)]\s+", ""
            $questionTexts.Add($questionText.Trim())
        }
    }

    $questionCount = $questionTexts.Count

    $timestampPattern = "(?i)(?:<a\s+[^>]*href=[""'][^""']*(?:youtu\.be/|youtube\.com/watch\?)[^""']*(?:[?&]t=\d+s?)[^""']*[""'][^>]*>\s*\d{1,2}:\d{2}(?::\d{2})?\s*</a>|\[\d{1,2}:\d{2}(?::\d{2})?\]\([^)]*(?:youtu\.be/|youtube\.com/watch\?)[^)]*(?:[?&]t=\d+s?)[^)]*\))"
    $timestampLinkCount = [regex]::Matches($Text, $timestampPattern).Count

    # Terms that often indicate unfinished or uncertain output.
    $redFlagPattern = "(?i)\b(TODO|FIXME|needs review|unclear|unknown|verify|verification needed|placeholder|timestamp needed|missing timestamp|not sure|unsure)\b"
    $redFlagCount = [regex]::Matches($Text, $redFlagPattern).Count

    $normalizedQuestions = foreach ($questionText in $questionTexts) {
        $q = $questionText
        $q = $q -replace '<[^>]+>', ''
        $q = $q -replace '\[[^\]]+\]\([^)]+\)', ''
        $q = $q -replace "^\s{0,3}#{2,6}\s+", ""
        $q = $q -replace "^\d+[\.\)]\s*", ""
        $q = $q -replace "\\\|", "|"
        $q = $q -replace "\s+", " "
        $q = $q.Trim().ToLowerInvariant()
        $q
    }

    $duplicates = $normalizedQuestions |
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

    return [pscustomobject]@{
        QuestionCount            = $questionCount
        TimestampLinkCount       = $timestampLinkCount
        RedFlagCount             = $redFlagCount
        DuplicateQuestionCount   = $duplicateQuestionCount
        DuplicateQuestionSamples = $duplicateSamples
    }
}

function Add-Score {
    param(
        [string[]]$Reasons,
        [int]$Score,
        [string]$Reason
    )

    return [pscustomobject]@{
        Reasons = $Reasons + $Reason
        Score   = $Score
    }
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

        if ($qualityStats.QuestionCount -gt 0 -and $qualityStats.TimestampLinkCount -eq 0) {
            $score += 20
            $reasons += "No timestamp links detected"
        }

        if ($qualityStats.RedFlagCount -gt 0) {
            $score += 15
            $reasons += "Red-flag wording detected"
        }

        if ($qualityStats.DuplicateQuestionCount -gt 0) {
            $score += 10
            $reasons += "Duplicate question headings detected"
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

        QuestionCount                 = $qualityStats.QuestionCount
        TimestampLinkCount            = $qualityStats.TimestampLinkCount
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
$markdown.Add("")

$markdown.Add("## Top Revision Candidates")
$markdown.Add("")
$markdown.Add("| Score | Priority | Episode | Slug | Questions | TXT Words | Q / 1k TXT Words | MD Words / 1k TXT Words | Reasons |")
$markdown.Add("|---:|---|---:|---|---:|---:|---:|---:|---|")

foreach ($row in ($sortedResults | Select-Object -First 50)) {
    $episode = if ($null -ne $row.EpisodeNumber) { $row.EpisodeNumber } else { "" }
    $safeReasons = ($row.Reasons -replace "\|", "\|")
    $safeSlug = ($row.Slug -replace "\|", "\|")

    $markdown.Add("| $($row.RevisionScore) | $($row.Priority) | $episode | $safeSlug | $($row.QuestionCount) | $($row.TxtWordCount) | $($row.QuestionsPer1000TxtWords) | $($row.MdWordsPer1000TxtWords) | $safeReasons |")
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
        $safeReasons = ($row.Reasons -replace "\|", "\|")
        $safeSlug = ($row.Slug -replace "\|", "\|")

        $markdown.Add("| $($row.Priority) | $episode | $safeSlug | $($row.MdExists) | $($row.TxtExists) | $safeReasons |")
    }
}

$markdown.Add("")
$markdown.Add("## Notes")
$markdown.Add("")
$markdown.Add("- The score is only a triage estimate.")
$markdown.Add("- Low question density does not prove the file is bad, but it is a strong candidate for review.")
$markdown.Add("- Very short transcripts may naturally have low question counts.")
$markdown.Add("- CSV output is the better file for sorting and filtering.")

$markdown | Set-Content -LiteralPath $markdownPath -Encoding UTF8

Write-Host "Revision report created:"
Write-Host "  CSV: $csvPath"
Write-Host "  MD : $markdownPath"
