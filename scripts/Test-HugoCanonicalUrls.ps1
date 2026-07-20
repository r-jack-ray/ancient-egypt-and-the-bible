param(
    [Parameter(Mandatory = $true)]
    [string]$PublicDir,

    [Parameter(Mandatory = $true)]
    [string]$ExpectedBaseUrl
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$PublicDir = (Resolve-Path -LiteralPath $PublicDir).Path

try {
    $baseUri = [Uri]::new($ExpectedBaseUrl, [UriKind]::Absolute)
}
catch {
    throw "ExpectedBaseUrl must be an absolute URL: $ExpectedBaseUrl"
}

if ($baseUri.Scheme -notin @("http", "https")) {
    throw "ExpectedBaseUrl must use HTTP or HTTPS: $ExpectedBaseUrl"
}

$normalizedBaseUrl = $baseUri.AbsoluteUri.TrimEnd("/") + "/"
$baseUri = [Uri]::new($normalizedBaseUrl)
$questionsDir = Join-Path $PublicDir "questions"

if (-not (Test-Path -LiteralPath $questionsDir -PathType Container)) {
    throw "Rendered questions directory was not found: $questionsDir"
}

$episodeFile = Get-ChildItem -LiteralPath $questionsDir -Directory |
    ForEach-Object {
        $candidate = Join-Path $_.FullName "index.html"
        if (Test-Path -LiteralPath $candidate -PathType Leaf) {
            Get-Item -LiteralPath $candidate
        }
    } |
    Sort-Object FullName |
    Select-Object -First 1

if (-not $episodeFile) {
    throw "No rendered episode page was found under $questionsDir."
}

$episodeRoute = [IO.Path]::GetRelativePath($PublicDir, $episodeFile.FullName) -replace "\\", "/"
$episodeRoute = $episodeRoute -replace "index\.html$", ""

$representativePages = @(
    [pscustomobject]@{
        Name = "home"
        File = Join-Path $PublicDir "index.html"
        Route = ""
    }
    [pscustomobject]@{
        Name = "questions section"
        File = Join-Path $questionsDir "index.html"
        Route = "questions/"
    }
    [pscustomobject]@{
        Name = "episode"
        File = $episodeFile.FullName
        Route = $episodeRoute
    }
)

foreach ($page in $representativePages) {
    if (-not (Test-Path -LiteralPath $page.File -PathType Leaf)) {
        throw "Rendered $($page.Name) page was not found: $($page.File)"
    }

    $html = Get-Content -LiteralPath $page.File -Raw
    $linkTags = [regex]::Matches($html, "<link\b[^>]*>", [Text.RegularExpressions.RegexOptions]::IgnoreCase)
    $canonicalTags = @($linkTags | Where-Object {
        $_.Value -match '\brel\s*=\s*(?:"canonical"|''canonical''|canonical)(?=\s|/?>)'
    })

    if ($canonicalTags.Count -ne 1) {
        throw "Rendered $($page.Name) page must contain exactly one canonical link; found $($canonicalTags.Count)."
    }

    $hrefMatch = [regex]::Match(
        $canonicalTags[0].Value,
        '\bhref\s*=\s*(?:"(?<double>[^"]*)"|''(?<single>[^'']*)''|(?<unquoted>[^\s>]+))',
        [Text.RegularExpressions.RegexOptions]::IgnoreCase
    )

    if (-not $hrefMatch.Success) {
        throw "Rendered $($page.Name) canonical link has no href."
    }

    $hrefValue = @("double", "single", "unquoted") |
        ForEach-Object { $hrefMatch.Groups[$_] } |
        Where-Object Success |
        Select-Object -First 1
    $actualUrl = [Net.WebUtility]::HtmlDecode($hrefValue.Value)
    $expectedUrl = [Uri]::new($baseUri, [string]$page.Route).AbsoluteUri

    if ($actualUrl -match "(?i)(localhost|127\.0\.0\.1)" -or $actualUrl -match "(?i)\.md(?:$|[?#])") {
        throw "Rendered $($page.Name) canonical URL is not a deployable page URL: $actualUrl"
    }

    if ($actualUrl -cne $expectedUrl) {
        throw "Rendered $($page.Name) canonical URL is '$actualUrl'; expected '$expectedUrl'."
    }

    Write-Host "Canonical URL passed ($($page.Name)): $actualUrl"
}

Write-Host "Representative Hugo canonical URL validation passed."
