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
$canonicalUrls = [Collections.Generic.HashSet[string]]::new([StringComparer]::Ordinal)
$renderedPageCount = 0

foreach ($file in Get-ChildItem -LiteralPath $PublicDir -Recurse -Filter "*.html" -File) {
    $relativePath = [IO.Path]::GetRelativePath($PublicDir, $file.FullName) -replace "\\", "/"
    $html = Get-Content -LiteralPath $file.FullName -Raw

    if (
        $relativePath -match '^google[a-z0-9]+\.html$' -and
        $html.Trim() -match '^google-site-verification:\s*google[a-z0-9]+\.html$'
    ) {
        continue
    }

    $renderedPageCount++
    $linkTags = [regex]::Matches($html, "<link\b[^>]*>", [Text.RegularExpressions.RegexOptions]::IgnoreCase)
    $canonicalTags = @($linkTags | Where-Object {
        $_.Value -match '\brel\s*=\s*(?:"canonical"|''canonical''|canonical)(?=\s|/?>)'
    })

    if ($canonicalTags.Count -ne 1) {
        throw "Rendered page must contain exactly one canonical link; found $($canonicalTags.Count): $relativePath"
    }

    $hrefMatch = [regex]::Match(
        $canonicalTags[0].Value,
        '\bhref\s*=\s*(?:"(?<double>[^"]*)"|''(?<single>[^'']*)''|(?<unquoted>[^\s>]+))',
        [Text.RegularExpressions.RegexOptions]::IgnoreCase
    )

    if (-not $hrefMatch.Success) {
        throw "Rendered page canonical link has no href: $relativePath"
    }

    $hrefValue = @("double", "single", "unquoted") |
        ForEach-Object { $hrefMatch.Groups[$_] } |
        Where-Object Success |
        Select-Object -First 1
    $actualUrl = [Net.WebUtility]::HtmlDecode($hrefValue.Value)
    $route = if ($relativePath -ceq "index.html") {
        ""
    }
    elseif ($relativePath.EndsWith("/index.html", [StringComparison]::Ordinal)) {
        $relativePath.Substring(0, $relativePath.Length - "index.html".Length)
    }
    else {
        $relativePath
    }
    $expectedUrl = [Uri]::new($baseUri, $route).AbsoluteUri

    if ($actualUrl -match "(?i)(localhost|127\.0\.0\.1)" -or $actualUrl -match "(?i)\.md(?:$|[?#])") {
        throw "Rendered page canonical URL is not deployable: $relativePath -> $actualUrl"
    }

    if ($actualUrl -cne $expectedUrl) {
        throw "Rendered page canonical URL is '$actualUrl'; expected '$expectedUrl': $relativePath"
    }

    if (-not $canonicalUrls.Add($actualUrl)) {
        throw "Multiple rendered pages use the same canonical URL: $actualUrl"
    }
}

if ($renderedPageCount -eq 0) {
    throw "No Hugo-rendered HTML pages were found under $PublicDir."
}

Write-Host "Full-site Hugo canonical URL validation passed."
Write-Host "Rendered/unique canonicals: $renderedPageCount/$($canonicalUrls.Count)"
