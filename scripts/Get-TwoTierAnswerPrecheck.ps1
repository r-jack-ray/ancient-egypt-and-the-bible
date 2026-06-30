<#
.SYNOPSIS
    Classifies docs/questions Markdown tables before the expanded-answer migration.

.DESCRIPTION
    Produces ignored local reports under reports/ by default:
      - two-tier-answer-precheck.json
      - two-tier-answer-precheck.md

    This script is read-only for source Markdown files.
#>

[CmdletBinding()]
param(
    [string]$RepoRoot = "",
    [string]$QuestionsDir = "docs/questions",
    [string]$OutputDir = "reports",
    [string]$JsonName = "two-tier-answer-precheck.json",
    [string]$MarkdownName = "two-tier-answer-precheck.md"
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

. "$PSScriptRoot/QuestionTableTools.ps1"

$repoRootPath = Resolve-QuestionRepositoryRoot -RepoRoot $RepoRoot
$questionsPath = Join-Path $repoRootPath $QuestionsDir
$outputPath = Join-Path $repoRootPath $OutputDir

if (-not (Test-Path -LiteralPath $questionsPath -PathType Container)) {
    throw "Questions directory not found: $questionsPath"
}

$files = @(Get-ChildItem -LiteralPath $questionsPath -Filter "*.md" | Sort-Object Name)
$details = foreach ($file in $files) {
    Get-QuestionTableAnalysis -Path $file.FullName -RepoRoot $repoRootPath
}

$ordinaryThreeColumn = @($details | Where-Object { $_.classification -eq "ordinaryThreeColumn" })
$ordinaryFourColumn = @($details | Where-Object { $_.classification -eq "ordinaryFourColumn" })
$specialFormat = @($details | Where-Object { $_.classification -eq "specialFormat" })
$malformed = @($details | Where-Object { $_.classification -eq "malformed" })
$warnings = @($details | ForEach-Object { $_.warnings })

$report = [ordered]@{
    generatedAt = (Get-Date).ToString("o")
    filesScanned = $files.Count
    ordinaryThreeColumn = $ordinaryThreeColumn.Count
    ordinaryFourColumn = $ordinaryFourColumn.Count
    specialFormat = $specialFormat.Count
    malformed = $malformed.Count
    totalQuestionRows = (@($details | Measure-Object -Property rowCount -Sum).Sum + 0)
    notes = @($warnings)
    files = @($details)
}

$markdown = New-Object System.Collections.Generic.List[string]
$markdown.Add("# Two-Tier Answer Precheck")
$markdown.Add("")
$markdown.Add("Generated: $($report.generatedAt)")
$markdown.Add("")
$markdown.Add("| Metric | Count |")
$markdown.Add("|---|---:|")
$markdown.Add("| Files scanned | $($report.filesScanned) |")
$markdown.Add("| Ordinary three-column | $($report.ordinaryThreeColumn) |")
$markdown.Add("| Ordinary four-column | $($report.ordinaryFourColumn) |")
$markdown.Add("| Special/adapted format | $($report.specialFormat) |")
$markdown.Add("| Malformed or suspicious | $($report.malformed) |")
$markdown.Add("| Total question rows | $($report.totalQuestionRows) |")
$markdown.Add("")

if ($malformed.Count -gt 0 -or $specialFormat.Count -gt 0) {
    $markdown.Add("## Skipped or Suspicious Files")
    $markdown.Add("")
    $markdown.Add("| File | Classification | Rows | Notes |")
    $markdown.Add("|---|---|---:|---|")
    foreach ($item in @($malformed + $specialFormat | Sort-Object file)) {
        $notes = @($item.hardErrors + $item.warnings) -join "<br>"
        $markdown.Add("| $($item.file) | $($item.classification) | $($item.rowCount) | $notes |")
    }
    $markdown.Add("")
}

if ($warnings.Count -gt 0) {
    $markdown.Add("## Warnings")
    $markdown.Add("")
    foreach ($warning in $warnings) {
        $markdown.Add("- $warning")
    }
    $markdown.Add("")
}

$jsonPath = Join-Path $outputPath $JsonName
$markdownPath = Join-Path $outputPath $MarkdownName
Write-QuestionReportFiles -Report $report -JsonPath $jsonPath -MarkdownPath $markdownPath -MarkdownLines $markdown.ToArray()

Write-Host "Two-tier answer precheck complete."
Write-Host "Files scanned: $($report.filesScanned)"
Write-Host "Ordinary three-column: $($report.ordinaryThreeColumn)"
Write-Host "Ordinary four-column: $($report.ordinaryFourColumn)"
Write-Host "Special/adapted format: $($report.specialFormat)"
Write-Host "Malformed or suspicious: $($report.malformed)"
Write-Host "Total question rows: $($report.totalQuestionRows)"
Write-Host "Reports:"
Write-Host "  $jsonPath"
Write-Host "  $markdownPath"

if ($malformed.Count -gt 0) {
    exit 1
}
