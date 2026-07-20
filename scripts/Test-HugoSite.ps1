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

$sourceQuestionFiles = @(Get-ChildItem -LiteralPath (Join-Path $RepoRoot "docs/questions") -Filter "*.md")
$sourceQuestionCount = $sourceQuestionFiles.Count
$generatedQuestionCount = @(Get-ChildItem -LiteralPath (Join-Path $RepoRoot "site/content/questions") -Filter "*.md" | Where-Object { $_.Name -ne "_index.md" }).Count

if ($sourceQuestionCount -ne $generatedQuestionCount) {
    throw "Generated question count $generatedQuestionCount does not match source count $sourceQuestionCount."
}

$episodes = Get-Content -LiteralPath (Join-Path $RepoRoot "site/data/episodes.json") -Raw | ConvertFrom-Json
$questions = Get-Content -LiteralPath (Join-Path $RepoRoot "site/data/questions.json") -Raw | ConvertFrom-Json
$generatedPages = Get-ChildItem -LiteralPath (Join-Path $RepoRoot "site/content/questions") -Filter "*.md" | Where-Object { $_.Name -ne "_index.md" }

$expectedNumberedPageCount = @($sourceQuestionFiles | Where-Object { $_.Name -match '^\d+-' }).Count
$expectedSpecialPageCount = @($sourceQuestionFiles | Where-Object { $_.Name -notmatch '^\d+-' }).Count
$numberedPages = @($generatedPages | Where-Object { $_.Name -match '^\d+-' })
$specialPages = @($generatedPages | Where-Object { $_.Name -notmatch '^\d+-' })

if ($numberedPages.Count -ne $expectedNumberedPageCount) {
    throw "Expected $expectedNumberedPageCount numbered pages from docs/questions, found $($numberedPages.Count)."
}

if ($specialPages.Count -ne $expectedSpecialPageCount) {
    throw "Expected $expectedSpecialPageCount special pages from docs/questions, found $($specialPages.Count)."
}

$generatedDescriptionRecords = @(
    foreach ($page in $generatedPages) {
        $content = Get-Content -LiteralPath $page.FullName -Raw
        $descriptionMatch = [regex]::Match($content, "(?m)^description: '(?<value>(?:[^']|'')*)'\r?$")
        $sourceMatch = [regex]::Match($content, "(?m)^description_source: '(?<value>generated_from_questions|curated_override)'\r?$")

        if (-not $descriptionMatch.Success -or -not $sourceMatch.Success) {
            throw "Generated page is missing a valid description or description_source: $($page.FullName)"
        }

        $description = $descriptionMatch.Groups["value"].Value.Replace("''", "'").Trim()
        $descriptionSource = $sourceMatch.Groups["value"].Value

        if ([string]::IsNullOrWhiteSpace($description)) {
            throw "Generated page has an empty description: $($page.FullName)"
        }

        if (
            $descriptionSource -eq "generated_from_questions" -and
            $description -notmatch '^Explore \d+ transcript-grounded questions? from .+(?:, including ".*" and ".*"|: ".*")$'
        ) {
            throw "Generated question-derived description is not substantive or uses an unexpected format: $($page.FullName)"
        }

        [pscustomobject]@{
            Path = $page.FullName
            Description = $description
            NormalizedDescription = $description.ToLowerInvariant()
            Source = $descriptionSource
        }
    }
)

$duplicateDescriptions = @(
    $generatedDescriptionRecords |
        Group-Object NormalizedDescription |
        Where-Object Count -gt 1
)

if ($duplicateDescriptions.Count -gt 0) {
    $duplicatePaths = $duplicateDescriptions | ForEach-Object { $_.Group.Path -join ", " }
    throw "Found duplicate generated page descriptions: $($duplicatePaths -join "; ")"
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
Write-Host "Generated/overridden descriptions: $(@($generatedDescriptionRecords | Where-Object Source -eq 'generated_from_questions').Count)/$(@($generatedDescriptionRecords | Where-Object Source -eq 'curated_override').Count)"
Write-Host "Question rows: $($questions.Count)"
