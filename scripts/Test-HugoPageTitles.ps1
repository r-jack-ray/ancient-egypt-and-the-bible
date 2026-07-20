param(
    [Parameter(Mandatory = $true)]
    [string]$PublicDir
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function ConvertTo-PlainHtmlText {
    param(
        [Parameter(Mandatory = $true)]
        [string]$Html
    )

    $withoutTags = [regex]::Replace($Html, "<[^>]+>", "")
    $decoded = [Net.WebUtility]::HtmlDecode($withoutTags)
    return ([regex]::Replace($decoded, "\s+", " ")).Trim()
}

$PublicDir = (Resolve-Path -LiteralPath $PublicDir).Path
$renderedPages = @()
$htmlPatternOptions = [Text.RegularExpressions.RegexOptions]::IgnoreCase -bor
    [Text.RegularExpressions.RegexOptions]::Singleline

foreach ($file in Get-ChildItem -LiteralPath $PublicDir -Recurse -Filter "*.html" -File) {
    $html = Get-Content -LiteralPath $file.FullName -Raw
    $canonicalTags = [regex]::Matches(
        $html,
        '<link\b(?=[^>]*\brel\s*=\s*(?:"canonical"|''canonical''|canonical)(?=\s|/?>))[^>]*>',
        [Text.RegularExpressions.RegexOptions]::IgnoreCase
    )

    if ($canonicalTags.Count -eq 0) {
        continue
    }

    $titleTags = [regex]::Matches($html, "<title\b[^>]*>(?<text>.*?)</title>", $htmlPatternOptions)
    $h1Tags = [regex]::Matches($html, "<h1\b[^>]*>(?<text>.*?)</h1>", $htmlPatternOptions)
    $relativePath = [IO.Path]::GetRelativePath($PublicDir, $file.FullName) -replace "\\", "/"

    if ($titleTags.Count -ne 1) {
        throw "Rendered page must contain exactly one title; found $($titleTags.Count): $relativePath"
    }

    if ($h1Tags.Count -ne 1) {
        throw "Rendered page must contain exactly one H1; found $($h1Tags.Count): $relativePath"
    }

    $title = ConvertTo-PlainHtmlText -Html $titleTags[0].Groups["text"].Value
    $h1 = ConvertTo-PlainHtmlText -Html $h1Tags[0].Groups["text"].Value

    if ([string]::IsNullOrWhiteSpace($title) -or [string]::IsNullOrWhiteSpace($h1)) {
        throw "Rendered page has an empty title or H1: $relativePath"
    }

    if ($title -match "(?i)^Questions in Livestream \d+(?:\s*\||$)") {
        throw "Rendered page still uses a generic livestream title: $relativePath"
    }

    $numberedH1 = [regex]::Match($h1, "^#(?<number>\d+):\s+(?<episode>.+)$")

    if ($numberedH1.Success) {
        $episodeTitle = $numberedH1.Groups["episode"].Value.Trim().TrimEnd(".")
        $expectedPrefix = "$episodeTitle - Livestream $($numberedH1.Groups["number"].Value) Q&A | "

        if (-not $title.StartsWith($expectedPrefix, [StringComparison]::Ordinal)) {
            throw "Numbered episode title does not match its H1 and livestream number: $relativePath"
        }
    }
    elseif ($relativePath -cne "index.html" -and -not $title.StartsWith("$h1 | ", [StringComparison]::Ordinal)) {
        throw "Rendered title is inconsistent with its H1: $relativePath"
    }

    if ($relativePath -cne "index.html" -and $title -ceq $h1) {
        throw "Non-home title must add useful context beyond its H1: $relativePath"
    }

    $suffixMatch = [regex]::Match($title, "\|\s*(?<suffix>[^|]+)$")
    $renderedPages += [pscustomobject]@{
        RelativePath = $relativePath
        Title = $title
        NormalizedTitle = $title.ToLowerInvariant()
        TitleSuffix = if ($suffixMatch.Success) { $suffixMatch.Groups["suffix"].Value.Trim() } else { $null }
    }
}

if ($renderedPages.Count -eq 0) {
    throw "No Hugo-rendered HTML pages were found under $PublicDir."
}

$duplicateTitles = @(
    $renderedPages |
        Group-Object NormalizedTitle |
        Where-Object Count -gt 1
)

if ($duplicateTitles.Count -gt 0) {
    $duplicatePaths = $duplicateTitles |
        ForEach-Object { $_.Group.RelativePath -join ", " }
    throw "Found duplicate rendered titles: $($duplicatePaths -join "; ")"
}

$nonHomePages = @($renderedPages | Where-Object RelativePath -CNE "index.html")
$missingSuffixPages = @($nonHomePages | Where-Object { [string]::IsNullOrWhiteSpace($_.TitleSuffix) })

if ($missingSuffixPages.Count -gt 0) {
    throw "Found non-home titles without a site-name suffix: $($missingSuffixPages.RelativePath -join ", ")"
}

$uniqueSuffixes = @($nonHomePages.TitleSuffix | Sort-Object -Unique)

if ($uniqueSuffixes.Count -ne 1) {
    throw "Rendered non-home titles must use one consistent site-name suffix."
}

Write-Host "Hugo page title validation passed."
Write-Host "Rendered/unique titles: $($renderedPages.Count)/$($renderedPages.Count)"
Write-Host "Site-name suffix: $($uniqueSuffixes[0])"
