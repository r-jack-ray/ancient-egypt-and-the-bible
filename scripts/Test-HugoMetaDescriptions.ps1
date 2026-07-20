param(
    [Parameter(Mandatory = $true)]
    [string]$PublicDir
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

$PublicDir = (Resolve-Path -LiteralPath $PublicDir).Path
$renderedPages = @()

foreach ($file in Get-ChildItem -LiteralPath $PublicDir -Recurse -Filter "*.html" -File) {
    $html = Get-Content -LiteralPath $file.FullName -Raw
    $metaTags = [regex]::Matches($html, "<meta\b[^>]*>", [Text.RegularExpressions.RegexOptions]::IgnoreCase)
    $linkTags = [regex]::Matches($html, "<link\b[^>]*>", [Text.RegularExpressions.RegexOptions]::IgnoreCase)
    $canonicalTags = @($linkTags | Where-Object {
        (Get-HtmlAttributeValue -Tag $_.Value -Name "rel") -ieq "canonical"
    })

    if ($canonicalTags.Count -eq 0) {
        continue
    }

    $descriptionTags = @($metaTags | Where-Object {
        (Get-HtmlAttributeValue -Tag $_.Value -Name "name") -ieq "description"
    })

    if ($descriptionTags.Count -ne 1) {
        throw "Rendered page must contain exactly one meta description; found $($descriptionTags.Count): $($file.FullName)"
    }

    $description = Get-HtmlAttributeValue -Tag $descriptionTags[0].Value -Name "content"

    if ([string]::IsNullOrWhiteSpace($description)) {
        throw "Rendered page has an empty meta description: $($file.FullName)"
    }

    $robotsTags = @($metaTags | Where-Object {
        (Get-HtmlAttributeValue -Tag $_.Value -Name "name") -ieq "robots"
    })
    $isIndexable = -not @($robotsTags | Where-Object {
        (Get-HtmlAttributeValue -Tag $_.Value -Name "content") -match "(?i)(?:^|[\s,])noindex(?:$|[\s,])"
    }).Count
    $relativePath = [IO.Path]::GetRelativePath($PublicDir, $file.FullName) -replace "\\", "/"

    $renderedPages += [pscustomobject]@{
        RelativePath = $relativePath
        Description = $description.Trim()
        NormalizedDescription = $description.Trim().ToLowerInvariant()
        IsIndexable = $isIndexable
    }
}

if ($renderedPages.Count -eq 0) {
    throw "No Hugo-rendered HTML pages were found under $PublicDir."
}

$duplicateDescriptions = @(
    $renderedPages |
        Where-Object IsIndexable |
        Group-Object NormalizedDescription |
        Where-Object Count -gt 1
)

if ($duplicateDescriptions.Count -gt 0) {
    $duplicatePaths = $duplicateDescriptions |
        ForEach-Object { $_.Group.RelativePath -join ", " }
    throw "Found duplicate meta descriptions on indexable pages: $($duplicatePaths -join "; ")"
}

$sectionPaths = @(
    "index.html",
    "episodes/index.html",
    "questions/index.html",
    "search/index.html"
)
$sectionPages = @(
    foreach ($sectionPath in $sectionPaths) {
        $page = $renderedPages | Where-Object RelativePath -CEQ $sectionPath
        if (-not $page) {
            throw "Expected rendered section page was not found: $sectionPath"
        }
        $page
    }
)
$uniqueSectionDescriptions = @($sectionPages.NormalizedDescription | Sort-Object -Unique)

if ($uniqueSectionDescriptions.Count -ne $sectionPages.Count) {
    throw "Home, Episodes, Questions, and Question Index must have distinct meta descriptions."
}

$indexableCount = @($renderedPages | Where-Object IsIndexable).Count
Write-Host "Hugo meta description validation passed."
Write-Host "Rendered/indexable pages: $($renderedPages.Count)/$indexableCount"
Write-Host "Distinct section descriptions: $($uniqueSectionDescriptions.Count)"
