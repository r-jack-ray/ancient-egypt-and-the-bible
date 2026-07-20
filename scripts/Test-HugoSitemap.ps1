param(
    [Parameter(Mandatory = $true)]
    [string]$PublicDir,

    [Parameter(Mandatory = $true)]
    [string]$ExpectedBaseUrl
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Get-HtmlAttributeValue {
    param(
        [Parameter(Mandatory = $true)]
        [string]$Tag,

        [Parameter(Mandatory = $true)]
        [string]$Name
    )

    $pattern = '\b' + [regex]::Escape($Name) + '\s*=\s*(?:"(?<double>[^"]*)"|''(?<single>[^'']*)''|(?<unquoted>[^\s>]+))'
    $match = [regex]::Match($Tag, $pattern, [Text.RegularExpressions.RegexOptions]::IgnoreCase)

    if (-not $match.Success) {
        return $null
    }

    foreach ($groupName in @("double", "single", "unquoted")) {
        if ($match.Groups[$groupName].Success) {
            return [Net.WebUtility]::HtmlDecode($match.Groups[$groupName].Value)
        }
    }

    return $null
}

function Get-ValidatedDeploymentUrl {
    param(
        [Parameter(Mandatory = $true)]
        [string]$Value,

        [Parameter(Mandatory = $true)]
        [string]$Label,

        [Parameter(Mandatory = $true)]
        [string]$BaseUrl
    )

    try {
        $uri = [Uri]::new($Value, [UriKind]::Absolute)
    }
    catch {
        throw "$Label is not an absolute URL: $Value"
    }

    if ($uri.Scheme -notin @("http", "https")) {
        throw "$Label must use HTTP or HTTPS: $Value"
    }

    if ($uri.Host -in @("localhost", "127.0.0.1") -or $uri.AbsolutePath -match "(?i)\.md$") {
        throw "$Label is not a deployable HTML page URL: $Value"
    }

    if (-not [string]::IsNullOrEmpty($uri.Query) -or -not [string]::IsNullOrEmpty($uri.Fragment)) {
        throw "$Label must not contain a query string or fragment: $Value"
    }

    if (-not $uri.AbsoluteUri.StartsWith($BaseUrl, [StringComparison]::Ordinal)) {
        throw "$Label is outside the configured deployment base '$BaseUrl': $Value"
    }

    return $uri.AbsoluteUri
}

$PublicDir = (Resolve-Path -LiteralPath $PublicDir).Path
$sitemapPath = Join-Path $PublicDir "sitemap.xml"

try {
    $baseUri = [Uri]::new($ExpectedBaseUrl, [UriKind]::Absolute)
}
catch {
    throw "ExpectedBaseUrl must be an absolute URL: $ExpectedBaseUrl"
}

if ($baseUri.Scheme -notin @("http", "https") -or $baseUri.Host -in @("localhost", "127.0.0.1")) {
    throw "ExpectedBaseUrl must be a deployable HTTP or HTTPS URL: $ExpectedBaseUrl"
}

$normalizedBaseUrl = $baseUri.AbsoluteUri.TrimEnd("/") + "/"

if (-not (Test-Path -LiteralPath $sitemapPath -PathType Leaf)) {
    throw "Rendered sitemap was not found: $sitemapPath"
}

try {
    $sitemap = [xml](Get-Content -LiteralPath $sitemapPath -Raw)
}
catch {
    throw "Rendered sitemap is not valid XML: $sitemapPath"
}

$sitemapNamespace = "http://www.sitemaps.org/schemas/sitemap/0.9"

if ($sitemap.DocumentElement.LocalName -ne "urlset" -or $sitemap.DocumentElement.NamespaceURI -ne $sitemapNamespace) {
    throw "Rendered sitemap must use the standard sitemap urlset namespace."
}

$namespaceManager = [Xml.XmlNamespaceManager]::new($sitemap.NameTable)
$namespaceManager.AddNamespace("s", $sitemapNamespace)
$sitemapUrlNodes = @($sitemap.SelectNodes("/s:urlset/s:url", $namespaceManager))
$actualUrls = [Collections.Generic.HashSet[string]]::new([StringComparer]::Ordinal)

foreach ($urlNode in $sitemapUrlNodes) {
    $locNodes = @($urlNode.SelectNodes("s:loc", $namespaceManager))

    if ($locNodes.Count -ne 1 -or [string]::IsNullOrWhiteSpace($locNodes[0].InnerText)) {
        throw "Every sitemap URL entry must contain exactly one non-empty loc element."
    }

    $url = Get-ValidatedDeploymentUrl -Value $locNodes[0].InnerText.Trim() -Label "Sitemap loc" -BaseUrl $normalizedBaseUrl

    if ($url -match "(?i)/search/?$") {
        throw "The noindexed search page must not appear in the sitemap: $url"
    }

    if (-not $actualUrls.Add($url)) {
        throw "Duplicate sitemap URL: $url"
    }
}

$expectedUrls = [Collections.Generic.HashSet[string]]::new([StringComparer]::Ordinal)
$renderedPageCount = 0
$indexablePageCount = 0

foreach ($file in Get-ChildItem -LiteralPath $PublicDir -Recurse -Filter "*.html" -File) {
    $html = Get-Content -LiteralPath $file.FullName -Raw
    $linkTags = [regex]::Matches($html, "<link\b[^>]*>", [Text.RegularExpressions.RegexOptions]::IgnoreCase)
    $canonicalTags = @($linkTags | Where-Object {
        (Get-HtmlAttributeValue -Tag $_.Value -Name "rel") -ieq "canonical"
    })

    if ($canonicalTags.Count -eq 0) {
        continue
    }

    $renderedPageCount++

    if ($canonicalTags.Count -ne 1) {
        throw "Rendered page must contain exactly one canonical link: $($file.FullName)"
    }

    $canonicalUrl = Get-HtmlAttributeValue -Tag $canonicalTags[0].Value -Name "href"

    if ([string]::IsNullOrWhiteSpace($canonicalUrl)) {
        throw "Rendered page has an empty canonical URL: $($file.FullName)"
    }

    $canonicalUrl = Get-ValidatedDeploymentUrl -Value $canonicalUrl -Label "Canonical URL" -BaseUrl $normalizedBaseUrl
    $metaTags = [regex]::Matches($html, "<meta\b[^>]*>", [Text.RegularExpressions.RegexOptions]::IgnoreCase)
    $robotsTags = @($metaTags | Where-Object {
        (Get-HtmlAttributeValue -Tag $_.Value -Name "name") -ieq "robots"
    })
    $isNoIndex = @($robotsTags | Where-Object {
        (Get-HtmlAttributeValue -Tag $_.Value -Name "content") -match "(?i)(?:^|[\s,])noindex(?:$|[\s,])"
    }).Count -gt 0

    if (-not $isNoIndex) {
        $indexablePageCount++

        if (-not $expectedUrls.Add($canonicalUrl)) {
            throw "Multiple indexable pages use the same canonical URL: $canonicalUrl"
        }
    }
}

if ($renderedPageCount -eq 0) {
    throw "No canonical HTML pages were found under $PublicDir."
}

$missingUrls = @($expectedUrls | Where-Object { -not $actualUrls.Contains($_) })
$unexpectedUrls = @($actualUrls | Where-Object { -not $expectedUrls.Contains($_) })

if ($missingUrls.Count -gt 0 -or $unexpectedUrls.Count -gt 0) {
    $details = @()
    if ($missingUrls.Count -gt 0) {
        $details += "missing: $($missingUrls -join ", ")"
    }
    if ($unexpectedUrls.Count -gt 0) {
        $details += "unexpected: $($unexpectedUrls -join ", ")"
    }
    throw "Sitemap URLs do not match canonical, indexable HTML pages ($($details -join "; "))."
}

$lastmodCount = @($sitemap.SelectNodes("/s:urlset/s:url/s:lastmod", $namespaceManager)).Count
Write-Host "Hugo sitemap validation passed."
Write-Host "Rendered/indexable/sitemap pages: $renderedPageCount/$indexablePageCount/$($actualUrls.Count)"
Write-Host "Lastmod entries: $lastmodCount"
