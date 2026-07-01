<#
.SYNOPSIS
    Validates ordinary docs/questions Q&A table structure.

.DESCRIPTION
    Validates ordinary Q&A tables against the current four-column baseline with
    populated Expanded answer cells and no pending placeholders. Use
    -AllowLegacyThreeColumn only for inventorying or diagnosing an unexpected
    legacy file.
#>

[CmdletBinding()]
param(
    [string]$RepoRoot = "",
    [string]$QuestionsDir = "docs/questions",
    [string]$OutputDir = "reports",
    [string]$JsonName = "question-table-validation.json",
    [string]$MarkdownName = "question-table-validation.md",
    [switch]$AllowLegacyThreeColumn,
    [switch]$RequireExpandedAnswer
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

. "$PSScriptRoot/QuestionTableTools.ps1"

$repoRootPath = Resolve-QuestionRepositoryRoot -RepoRoot $RepoRoot
$questionsPath = Join-Path $repoRootPath $QuestionsDir
$outputPath = Join-Path $repoRootPath $OutputDir
$requireExpandedAnswerEffective = -not $AllowLegacyThreeColumn
if ($RequireExpandedAnswer) {
    $requireExpandedAnswerEffective = $true
}

if (-not (Test-Path -LiteralPath $questionsPath -PathType Container)) {
    throw "Questions directory not found: $questionsPath"
}

$files = @(Get-ChildItem -LiteralPath $questionsPath -Filter "*.md" | Sort-Object Name)
$details = foreach ($file in $files) {
    Get-QuestionTableAnalysis -Path $file.FullName -RepoRoot $repoRootPath -RequireExpandedAnswer:$requireExpandedAnswerEffective
}

$ordinary = @($details | Where-Object { $_.classification -in @("ordinaryThreeColumn", "ordinaryFourColumn", "malformed") -and $_.headerColumns -gt 0 })
$malformed = @($details | Where-Object { $_.classification -eq "malformed" })
$warnings = @($details | ForEach-Object { $_.warnings })
$hardErrors = @($details | ForEach-Object { $_.hardErrors })
$ordinaryFourColumn = @($details | Where-Object { $_.classification -eq "ordinaryFourColumn" })

$report = [ordered]@{
    generatedAt = (Get-Date).ToString("o")
    requireExpandedAnswer = [bool]$requireExpandedAnswerEffective
    allowLegacyThreeColumn = [bool]$AllowLegacyThreeColumn
    filesScanned = $files.Count
    ordinaryFilesValidated = $ordinary.Count
    ordinaryFourColumn = $ordinaryFourColumn.Count
    totalQuestionRows = (@($details | Measure-Object -Property rowCount -Sum).Sum + 0)
    pendingExpandedAnswers = (@($details | Measure-Object -Property pendingExpandedAnswers -Sum).Sum + 0)
    completedExpandedAnswers = (@($details | Measure-Object -Property completedExpandedAnswers -Sum).Sum + 0)
    emptyExpandedAnswers = (@($details | Measure-Object -Property emptyExpandedAnswers -Sum).Sum + 0)
    malformed = $malformed.Count
    hardErrorCount = $hardErrors.Count
    warningCount = $warnings.Count
    hardErrors = $hardErrors
    warnings = $warnings
    files = @($details)
}

$markdown = New-Object System.Collections.Generic.List[string]
$markdown.Add("# Question Table Validation")
$markdown.Add("")
$markdown.Add("Generated: $($report.generatedAt)")
$markdown.Add("")
$markdown.Add("| Metric | Count |")
$markdown.Add("|---|---:|")
$markdown.Add("| Files scanned | $($report.filesScanned) |")
$markdown.Add("| Ordinary files validated | $($report.ordinaryFilesValidated) |")
$markdown.Add("| Ordinary four-column | $($report.ordinaryFourColumn) |")
$markdown.Add("| Total question rows | $($report.totalQuestionRows) |")
$markdown.Add("| Pending expanded answers | $($report.pendingExpandedAnswers) |")
$markdown.Add("| Completed expanded answers | $($report.completedExpandedAnswers) |")
$markdown.Add("| Empty expanded-answer cells | $($report.emptyExpandedAnswers) |")
$markdown.Add("| Malformed files | $($report.malformed) |")
$markdown.Add("| Hard errors | $($report.hardErrorCount) |")
$markdown.Add("| Warnings | $($report.warningCount) |")
$markdown.Add("")

if ($hardErrors.Count -gt 0) {
    $markdown.Add("## Hard Errors")
    $markdown.Add("")
    foreach ($errorMessage in $hardErrors) {
        $markdown.Add("- $errorMessage")
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

Write-Host "Question table validation complete."
Write-Host "Files scanned: $($report.filesScanned)"
Write-Host "Ordinary files validated: $($report.ordinaryFilesValidated)"
Write-Host "Question rows: $($report.totalQuestionRows)"
Write-Host "Hard errors: $($report.hardErrorCount)"
Write-Host "Warnings: $($report.warningCount)"
Write-Host "Reports:"
Write-Host "  $jsonPath"
Write-Host "  $markdownPath"

if ($hardErrors.Count -gt 0) {
    exit 1
}
