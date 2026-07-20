param(
    [Parameter(Mandatory = $true)]
    [string]$PublicDir,

    [Parameter(Mandatory = $true)]
    [string]$ExpectedBaseUrl,

    [string[]]$ExpectedNoIndexPaths = @("search/index.html")
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Get-HtmlAttributeValue {
    param(
        [Parameter(Mandatory = $true)][string]$Tag,
        [Parameter(Mandatory = $true)][string]$Name
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

function Get-PageRoute {
    param([Parameter(Mandatory = $true)][string]$RelativePath)

    if ($RelativePath -ceq "index.html") {
        return ""
    }

    if ($RelativePath.EndsWith("/index.html", [StringComparison]::Ordinal)) {
        return $RelativePath.Substring(0, $RelativePath.Length - "index.html".Length)
    }

    return $RelativePath
}

function Get-InternalTargetFile {
    param(
        [Parameter(Mandatory = $true)][Uri]$Uri,
        [Parameter(Mandatory = $true)][Uri]$BaseUri,
        [Parameter(Mandatory = $true)][string]$RootPath
    )

    $basePath = $BaseUri.AbsolutePath
    if (-not $Uri.AbsolutePath.StartsWith($basePath, [StringComparison]::Ordinal)) {
        return $null
    }

    $relativeUrlPath = $Uri.AbsolutePath.Substring($basePath.Length)
    try {
        $relativeUrlPath = [Uri]::UnescapeDataString($relativeUrlPath)
    }
    catch {
        return $null
    }

    $relativeFilePath = $relativeUrlPath.Replace('/', [IO.Path]::DirectorySeparatorChar)
    $candidatePaths = New-Object System.Collections.Generic.List[string]

    if ([string]::IsNullOrWhiteSpace($relativeFilePath)) {
        $candidatePaths.Add("index.html")
    }
    elseif ($Uri.AbsolutePath.EndsWith("/", [StringComparison]::Ordinal)) {
        $candidatePaths.Add((Join-Path $relativeFilePath "index.html"))
    }
    else {
        $candidatePaths.Add($relativeFilePath)
        if ([string]::IsNullOrEmpty([IO.Path]::GetExtension($relativeFilePath))) {
            $candidatePaths.Add((Join-Path $relativeFilePath "index.html"))
        }
    }

    $rootPrefix = $RootPath.TrimEnd([IO.Path]::DirectorySeparatorChar, [IO.Path]::AltDirectorySeparatorChar) + [IO.Path]::DirectorySeparatorChar
    foreach ($candidatePath in $candidatePaths) {
        $fullPath = [IO.Path]::GetFullPath((Join-Path $RootPath $candidatePath))
        if (-not $fullPath.StartsWith($rootPrefix, [StringComparison]::OrdinalIgnoreCase)) {
            continue
        }

        if (Test-Path -LiteralPath $fullPath -PathType Leaf) {
            return $fullPath
        }
    }

    return $null
}

function Test-HtmlFragment {
    param(
        [Parameter(Mandatory = $true)][string]$Html,
        [Parameter(Mandatory = $true)][string]$Fragment
    )

    if ([string]::IsNullOrWhiteSpace($Fragment) -or $Fragment.StartsWith(":~:text=", [StringComparison]::Ordinal)) {
        return $true
    }

    $target = [Net.WebUtility]::HtmlDecode([Uri]::UnescapeDataString($Fragment))
    $attributeMatches = [regex]::Matches(
        $Html,
        '\b(?:id|name)\s*=\s*(?:"(?<double>[^"]*)"|''(?<single>[^'']*)''|(?<unquoted>[^\s>]+))',
        [Text.RegularExpressions.RegexOptions]::IgnoreCase
    )

    foreach ($attributeMatch in $attributeMatches) {
        foreach ($groupName in @("double", "single", "unquoted")) {
            if (
                $attributeMatch.Groups[$groupName].Success -and
                [Net.WebUtility]::HtmlDecode($attributeMatch.Groups[$groupName].Value) -ceq $target
            ) {
                return $true
            }
        }
    }

    return $false
}

$PublicDir = (Resolve-Path -LiteralPath $PublicDir).Path

try {
    $baseUri = [Uri]::new($ExpectedBaseUrl.TrimEnd('/') + '/', [UriKind]::Absolute)
}
catch {
    throw "ExpectedBaseUrl must be an absolute URL: $ExpectedBaseUrl"
}

if ($baseUri.Scheme -notin @("http", "https") -or $baseUri.Host -in @("localhost", "127.0.0.1")) {
    throw "ExpectedBaseUrl must be a deployable HTTP or HTTPS URL: $ExpectedBaseUrl"
}

$expectedNoIndexSet = [Collections.Generic.HashSet[string]]::new([StringComparer]::Ordinal)
foreach ($path in $ExpectedNoIndexPaths) {
    [void]$expectedNoIndexSet.Add(($path -replace '\\', '/').TrimStart('/'))
}

$seenNoIndexSet = [Collections.Generic.HashSet[string]]::new([StringComparer]::Ordinal)
$htmlCache = @{}
$brokenLinks = New-Object System.Collections.Generic.List[string]
$internalLinkCount = 0
$jsonLdCount = 0
$htmlFiles = @(Get-ChildItem -LiteralPath $PublicDir -Recurse -Filter "*.html" -File)
$renderedPageCount = 0

if ($htmlFiles.Count -eq 0) {
    throw "No Hugo-rendered HTML pages were found under $PublicDir."
}

foreach ($file in $htmlFiles) {
    $relativePath = [IO.Path]::GetRelativePath($PublicDir, $file.FullName) -replace "\\", "/"
    $html = Get-Content -LiteralPath $file.FullName -Raw

    if (
        $relativePath -match '^google[a-z0-9]+\.html$' -and
        $html.Trim() -match '^google-site-verification:\s*google[a-z0-9]+\.html$'
    ) {
        continue
    }

    $renderedPageCount++
    $htmlCache[$file.FullName] = $html

    $titleTags = [regex]::Matches($html, "<title\b[^>]*>.*?</title>", "IgnoreCase,Singleline")
    $h1Tags = [regex]::Matches($html, "<h1\b[^>]*>.*?</h1>", "IgnoreCase,Singleline")
    $linkTags = [regex]::Matches($html, "<link\b[^>]*>", [Text.RegularExpressions.RegexOptions]::IgnoreCase)
    $metaTags = [regex]::Matches($html, "<meta\b[^>]*>", [Text.RegularExpressions.RegexOptions]::IgnoreCase)
    $canonicalTags = @($linkTags | Where-Object {
        @((Get-HtmlAttributeValue -Tag $_.Value -Name "rel") -split '\s+') -icontains "canonical"
    })
    $descriptionTags = @($metaTags | Where-Object {
        (Get-HtmlAttributeValue -Tag $_.Value -Name "name") -ieq "description"
    })

    if ($titleTags.Count -ne 1 -or $h1Tags.Count -ne 1 -or $canonicalTags.Count -ne 1 -or $descriptionTags.Count -ne 1) {
        throw "Rendered page must contain exactly one title, H1, canonical, and meta description: $relativePath (title=$($titleTags.Count), h1=$($h1Tags.Count), canonical=$($canonicalTags.Count), description=$($descriptionTags.Count))"
    }

    $description = Get-HtmlAttributeValue -Tag $descriptionTags[0].Value -Name "content"
    if ([string]::IsNullOrWhiteSpace($description)) {
        throw "Rendered page has an empty meta description: $relativePath"
    }

    $robotsTags = @($metaTags | Where-Object {
        (Get-HtmlAttributeValue -Tag $_.Value -Name "name") -ieq "robots"
    })
    $noIndexTags = @($robotsTags | Where-Object {
        (Get-HtmlAttributeValue -Tag $_.Value -Name "content") -match "(?i)(?:^|[\s,])noindex(?:$|[\s,])"
    })

    if ($expectedNoIndexSet.Contains($relativePath)) {
        if ($robotsTags.Count -ne 1 -or $noIndexTags.Count -ne 1) {
            throw "Expected exactly one noindex robots tag on $relativePath."
        }
        [void]$seenNoIndexSet.Add($relativePath)
    }
    elseif ($noIndexTags.Count -gt 0) {
        throw "Unexpected noindex robots directive on $relativePath."
    }

    $jsonLdScripts = @([regex]::Matches(
        $html,
        '<script\b(?=[^>]*\btype\s*=\s*(?:"application/ld\+json"|''application/ld\+json''|application/ld\+json))[^>]*>(?<json>.*?)</script>',
        "IgnoreCase,Singleline"
    ))

    foreach ($jsonLdScript in $jsonLdScripts) {
        $jsonLd = $jsonLdScript.Groups["json"].Value.Trim()
        if ([string]::IsNullOrWhiteSpace($jsonLd)) {
            throw "Rendered page contains an empty JSON-LD block: $relativePath"
        }

        try {
            $null = $jsonLd | ConvertFrom-Json -Depth 100
        }
        catch {
            throw "Rendered page contains invalid JSON-LD: $relativePath ($($_.Exception.Message))"
        }
        $jsonLdCount++
    }

    $pageUri = [Uri]::new($baseUri, (Get-PageRoute -RelativePath $relativePath))
    $anchorTags = [regex]::Matches($html, '<(?:a|area)\b[^>]*>', [Text.RegularExpressions.RegexOptions]::IgnoreCase)

    foreach ($anchorTag in $anchorTags) {
        $href = Get-HtmlAttributeValue -Tag $anchorTag.Value -Name "href"
        if ([string]::IsNullOrWhiteSpace($href) -or $href -eq "#") {
            continue
        }

        if ($href -match '^(?i)(?:mailto|tel|javascript|data):') {
            continue
        }

        try {
            $targetUri = [Uri]::new($pageUri, $href)
        }
        catch {
            $brokenLinks.Add("$relativePath -> $href (invalid URL)")
            continue
        }

        if ($targetUri.Host -ine $baseUri.Host -or $targetUri.Port -ne $baseUri.Port) {
            continue
        }

        $internalLinkCount++
        $targetFile = Get-InternalTargetFile -Uri $targetUri -BaseUri $baseUri -RootPath $PublicDir
        if (-not $targetFile) {
            $brokenLinks.Add("$relativePath -> $href (missing target or outside deployment base)")
            continue
        }

        if (-not [string]::IsNullOrEmpty($targetUri.Fragment) -and [IO.Path]::GetExtension($targetFile) -ieq ".html") {
            if (-not $htmlCache.ContainsKey($targetFile)) {
                $htmlCache[$targetFile] = Get-Content -LiteralPath $targetFile -Raw
            }

            $fragment = $targetUri.Fragment.TrimStart('#')
            if (-not (Test-HtmlFragment -Html $htmlCache[$targetFile] -Fragment $fragment)) {
                $brokenLinks.Add("$relativePath -> $href (missing fragment)")
            }
        }
    }
}

$missingNoIndexPaths = @($expectedNoIndexSet | Where-Object { -not $seenNoIndexSet.Contains($_) })
if ($missingNoIndexPaths.Count -gt 0) {
    throw "Expected noindex pages were not found or validated: $($missingNoIndexPaths -join ', ')"
}

if ($brokenLinks.Count -gt 0) {
    $examples = @($brokenLinks | Select-Object -First 20)
    $suffix = if ($brokenLinks.Count -gt $examples.Count) { " (showing first $($examples.Count))" } else { "" }
    throw "Found $($brokenLinks.Count) broken internal links$suffix`: $($examples -join '; ')"
}

Write-Host "Rendered SEO regression validation passed."
Write-Host "Pages/internal links: $renderedPageCount/$internalLinkCount"
Write-Host "Noindex pages/JSON-LD blocks: $($seenNoIndexSet.Count)/$jsonLdCount"
