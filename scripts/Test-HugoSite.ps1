param(
    [string]$RepoRoot = (Split-Path -Parent $PSScriptRoot),
    [switch]$SkipHugo
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$RepoRoot = (Resolve-Path -LiteralPath $RepoRoot).Path
$builder = Join-Path $RepoRoot "scripts/Build-HugoSiteContent.ps1"
$searchAliasTester = Join-Path $RepoRoot "scripts/Test-HugoSearchAliases.ps1"

pwsh -NoProfile -File $builder -RepoRoot $RepoRoot
Write-Host "Validating Hugo search aliases..."
pwsh -NoProfile -File $searchAliasTester -RepoRoot $RepoRoot

$sourceQuestionCount = @(Get-ChildItem -LiteralPath (Join-Path $RepoRoot "docs/questions") -Filter "*.md").Count
$generatedQuestionCount = @(Get-ChildItem -LiteralPath (Join-Path $RepoRoot "site/content/questions") -Filter "*.md" | Where-Object { $_.Name -ne "_index.md" }).Count

if ($sourceQuestionCount -ne $generatedQuestionCount) {
    throw "Generated question count $generatedQuestionCount does not match source count $sourceQuestionCount."
}

$episodes = Get-Content -LiteralPath (Join-Path $RepoRoot "site/data/episodes.json") -Raw | ConvertFrom-Json
$questions = Get-Content -LiteralPath (Join-Path $RepoRoot "site/data/questions.json") -Raw | ConvertFrom-Json
$generatedPages = Get-ChildItem -LiteralPath (Join-Path $RepoRoot "site/content/questions") -Filter "*.md" | Where-Object { $_.Name -ne "_index.md" }

$numberedPages = @($generatedPages | Where-Object { $_.Name -match '^\d+-' })
$specialPages = @($generatedPages | Where-Object { $_.Name -notmatch '^\d+-' })

if ($numberedPages.Count -ne 265) {
    throw "Expected 265 numbered pages, found $($numberedPages.Count)."
}

if ($specialPages.Count -ne 13) {
    throw "Expected 13 special pages, found $($specialPages.Count)."
}

$badRows = @($questions | Where-Object {
    [string]::IsNullOrWhiteSpace($_.question_page) -or
    [string]::IsNullOrWhiteSpace($_.question) -or
    [string]::IsNullOrWhiteSpace($_.short_answer) -or
    [string]::IsNullOrWhiteSpace($_.time_label) -or
    [string]::IsNullOrWhiteSpace($_.video_url)
})

if ($badRows.Count -gt 0) {
    throw "Found $($badRows.Count) generated question rows with missing required fields."
}

$badExpandedRows = @($questions | Where-Object {
    [string]::IsNullOrWhiteSpace($_.expanded_answer) -or
    $_.expanded_answer -match '_Expansion pending\._'
})

if ($badExpandedRows.Count -gt 0) {
    throw "Found $($badExpandedRows.Count) generated question rows with missing or pending expanded answers."
}

if (-not $SkipHugo) {
    $hugoCommand = Get-Command hugo -ErrorAction SilentlyContinue
    if (-not $hugoCommand) {
        throw "Hugo is not installed or not on PATH. Install Hugo, then run: pwsh -NoProfile -File scripts/Test-HugoSite.ps1"
    }

    & $hugoCommand.Source --source (Join-Path $RepoRoot "site")
    if ($LASTEXITCODE -ne 0) {
        throw "Hugo build failed with exit code $LASTEXITCODE."
    }
}

Write-Host "Hugo compatibility validation passed."
Write-Host "Source/generated pages: $sourceQuestionCount"
Write-Host "Numbered/special pages: $($numberedPages.Count)/$($specialPages.Count)"
Write-Host "Question rows: $($questions.Count)"
