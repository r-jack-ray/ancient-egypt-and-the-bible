<#
.SYNOPSIS
Scrapes the Ancient Egypt and the Bible YouTube streams tab and writes a Markdown archive.

.VERSION
v011 - Fixes chronological ordering by extracting ordered video renderers and disabling raw-text fallback by default.

.DESCRIPTION
PowerShell 7 script that reads YouTube's embedded page JSON/text, extracts public stream titles and URLs,
then follows YouTube continuation tokens through the public InnerTube browse endpoint.

Important notes:
- The official YouTube Data API requires an API key or OAuth; this script does not use it.
- This script uses the public web page's embedded InnerTube API key and public continuation tokens.
- Default scope is only the public /streams Live tab. It does not scrape /videos, /shorts, or other channel tabs.
- Optional -UseUploadsPlaylistFallback can be used for diagnostics, but it is off by default.

Default output matches the existing archive style:
- [Live Stream #209: One-Meaning Flippancy](https://www.youtube.com/watch?v=H6CBCG9YX4U) `209-one-meaning-flippancy`

Default behavior includes all public entries exposed on the /streams Live tab, including non-Q&A streams such as gameplay streams.
Use -NumberedOnly to output only numbered Live Stream entries.
Default order follows ordered video renderers from the /streams Live tab, newest-to-oldest, with non-numbered streams interleaved.
Use -OldestFirst to reverse that order. Use -SortByNumber to restore the older numbered-first archive sort.
-IncludeOtherLiveStreams is still accepted for older command lines, but it is now the default behavior.
-UseUploadsPlaylistFallback is optional and should only be used for diagnostics, because it leaves the strict /streams-tab scope.
#>

[CmdletBinding()]
param(
    [string]$StreamsUrl = 'https://www.youtube.com/@ancientegyptandthebible/streams',
    [string]$OutputPath = '.\live-stream-list.md',
    [int]$MaxVideos = 0,
    [int]$ContinuationDelayMs = 350,
    [int]$MaxContinuationPagesPerSource = 100,
    [int]$MaxStaleContinuationPages = 10,
    [switch]$NoClobber,
    [switch]$WriteDebugDump,
    [switch]$SkipStreamsTab,
    [switch]$SkipUploadsPlaylist,
    [switch]$UseUploadsPlaylistFallback,
    [switch]$NumberedOnly,
    [switch]$IncludeOtherLiveStreams,
    [switch]$OldestFirst,
    [switch]$SortByNumber,
    [switch]$AllowRawTextFallback
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$BaseWatchUrl = 'https://www.youtube.com/watch?v='
$VideoIdPattern = '[A-Za-z0-9_-]{11}'
$Headers = @{
    'User-Agent'      = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36'
    'Accept-Language' = 'en-US,en;q=0.9'
    'Accept'          = 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
}

# DisplayOrder tracks ordered video renderer discovery from the /streams tab so non-numbered streams can stay
# interleaved with numbered Q&A streams instead of being grouped at the end.
$script:NextArchiveDisplayOrder = 0

function Remove-Diacritics {
    param([AllowNull()][string]$Text)

    if ([string]::IsNullOrWhiteSpace($Text)) { return $Text }

    $normalized = $Text.Normalize([System.Text.NormalizationForm]::FormD)
    $builder = [System.Text.StringBuilder]::new()

    foreach ($ch in $normalized.ToCharArray()) {
        $category = [System.Globalization.CharUnicodeInfo]::GetUnicodeCategory($ch)
        if ($category -ne [System.Globalization.UnicodeCategory]::NonSpacingMark) {
            [void]$builder.Append($ch)
        }
    }

    return $builder.ToString().Normalize([System.Text.NormalizationForm]::FormC)
}

function Get-LiveStreamTitleInfo {
    param([AllowNull()][string]$Title)

    if ([string]::IsNullOrWhiteSpace($Title)) {
        return [pscustomobject]@{
            IsNumbered      = $false
            Number          = 0
            NormalizedTitle = $Title
        }
    }

    $cleanTitle = (Decode-JsonishString $Title).Trim()

    # Accept the real title, the common early typo "Live Steam", and the older "# 12" spacing.
    $match = [regex]::Match($cleanTitle, '^\s*Live\s+St(?:r)?eam\s*#\s*(?<num>\d+)\s*[:\-–—]?\s*(?<name>.*)$', 'IgnoreCase')
    if (-not $match.Success) {
        return [pscustomobject]@{
            IsNumbered      = $false
            Number          = 0
            NormalizedTitle = $cleanTitle
        }
    }

    $number = [int]$match.Groups['num'].Value
    $name = ([string]$match.Groups['name'].Value).Trim()
    $normalizedTitle = if ([string]::IsNullOrWhiteSpace($name)) {
        "Live Stream #$number"
    }
    else {
        "Live Stream #${number}: $name"
    }

    return [pscustomobject]@{
        IsNumbered      = $true
        Number          = $number
        NormalizedTitle = $normalizedTitle
    }
}

function ConvertTo-Slug {
    param([Parameter(Mandatory)][string]$Title)

    $titleInfo = Get-LiveStreamTitleInfo -Title $Title
    $text = $titleInfo.NormalizedTitle.Trim()

    if ($titleInfo.IsNumbered) {
        $name = $text -replace '^\s*Live\s+Stream\s*#\s*\d+\s*[:\-–—]?\s*', ''
        $text = if ([string]::IsNullOrWhiteSpace($name)) { [string]$titleInfo.Number } else { "$($titleInfo.Number) $name" }
    }

    $text = Remove-Diacritics $text

    # PowerShell -replace is case-insensitive. Use -creplace here or every pair of letters gets split.
    $text = $text -creplace '([a-z])([A-Z])', '$1 $2'
    $text = $text -creplace '([0-9])([A-Za-z])', '$1 $2'
    $text = $text -replace '(?<=\d),(?=\d)', ''

    $text = $text.ToLowerInvariant()
    $text = $text -replace '[’‘]', ''
    $text = $text -replace '["“”]', ''
    $text = $text -replace '&', ' and '
    $text = $text -replace '[^a-z0-9]+', '-'
    $text = $text.Trim('-')
    $text = $text -replace '-subscribers$', '-subs'

    return $text
}

function Get-OptionalProperty {
    param(
        $Object,
        [Parameter(Mandatory)][string]$Name
    )

    if ($null -eq $Object) { return $null }
    $property = $Object.PSObject.Properties[$Name]
    if ($null -eq $property) { return $null }
    return $property.Value
}

function Decode-JsonishString {
    param([AllowNull()][string]$Value)

    if ([string]::IsNullOrWhiteSpace($Value)) { return $Value }

    $decoded = $Value
    try { $decoded = [System.Text.RegularExpressions.Regex]::Unescape($decoded) }
    catch { }

    $decoded = $decoded -replace '\\/', '/'
    $decoded = [System.Net.WebUtility]::HtmlDecode($decoded)
    return $decoded.Trim()
}

function Get-NextNonWhitespaceIndex {
    param(
        [Parameter(Mandatory)][string]$Text,
        [Parameter(Mandatory)][int]$StartIndex
    )

    for ($i = $StartIndex; $i -lt $Text.Length; $i++) {
        if (-not [char]::IsWhiteSpace($Text[$i])) { return $i }
    }
    return -1
}

function Get-BalancedTextAtIndex {
    param(
        [Parameter(Mandatory)][string]$Text,
        [Parameter(Mandatory)][int]$StartIndex,
        [char]$OpenChar = '{',
        [char]$CloseChar = '}'
    )

    if ($StartIndex -lt 0 -or $StartIndex -ge $Text.Length -or $Text[$StartIndex] -ne $OpenChar) { return $null }

    $depth = 0
    $inString = $false
    $escape = $false

    for ($i = $StartIndex; $i -lt $Text.Length; $i++) {
        $ch = $Text[$i]

        if ($inString) {
            if ($escape) { $escape = $false; continue }
            if ($ch -eq '\') { $escape = $true; continue }
            if ($ch -eq '"') { $inString = $false; continue }
            continue
        }

        if ($ch -eq '"') { $inString = $true; continue }
        if ($ch -eq $OpenChar) { $depth++; continue }
        if ($ch -eq $CloseChar) {
            $depth--
            if ($depth -eq 0) { return $Text.Substring($StartIndex, $i - $StartIndex + 1) }
        }
    }

    return $null
}

function Get-JsonObjectAfterMarker {
    param(
        [Parameter(Mandatory)][string]$Text,
        [Parameter(Mandatory)][string]$Marker,
        [string[]]$MustHaveAnyTopLevelProperty = @()
    )

    $searchIndex = 0
    while ($searchIndex -lt $Text.Length) {
        $markerIndex = $Text.IndexOf($Marker, $searchIndex, [StringComparison]::Ordinal)
        if ($markerIndex -lt 0) { return $null }

        $afterMarkerIndex = $markerIndex + $Marker.Length
        $jsonStartIndex = Get-NextNonWhitespaceIndex -Text $Text -StartIndex $afterMarkerIndex

        if ($jsonStartIndex -ge 0 -and $Text[$jsonStartIndex] -eq '{') {
            $candidateJson = Get-BalancedTextAtIndex -Text $Text -StartIndex $jsonStartIndex
            if (-not [string]::IsNullOrWhiteSpace($candidateJson)) {
                try {
                    $candidateObject = $candidateJson | ConvertFrom-Json -Depth 100 -ErrorAction Stop
                    if ($MustHaveAnyTopLevelProperty.Count -eq 0) {
                        return [pscustomobject]@{ Json = $candidateJson; Object = $candidateObject }
                    }
                    foreach ($name in $MustHaveAnyTopLevelProperty) {
                        if ($null -ne $candidateObject.PSObject.Properties[$name]) {
                            return [pscustomobject]@{ Json = $candidateJson; Object = $candidateObject }
                        }
                    }
                }
                catch { }
            }
        }

        $searchIndex = $afterMarkerIndex
    }

    return $null
}

function Get-JsonStringValueFromText {
    param(
        [Parameter(Mandatory)][string]$Text,
        [Parameter(Mandatory)][string]$PropertyName,
        [string]$DefaultValue = $null
    )

    $pattern = '"' + [regex]::Escape($PropertyName) + '"\s*:\s*"(?<value>(?:\\.|[^"\\])*)"'
    $match = [regex]::Match($Text, $pattern)
    if ($match.Success) { return Decode-JsonishString $match.Groups['value'].Value }
    return $DefaultValue
}

function Get-YoutubeChannelIdFromHtml {
    param([Parameter(Mandatory)][string]$Html)

    $patterns = @(
        '"externalId"\s*:\s*"(?<id>UC[A-Za-z0-9_-]{22})"',
        '"channelId"\s*:\s*"(?<id>UC[A-Za-z0-9_-]{22})"',
        '<meta\s+itemprop="channelId"\s+content="(?<id>UC[A-Za-z0-9_-]{22})"',
        'feeds/videos\.xml\?channel_id=(?<id>UC[A-Za-z0-9_-]{22})'
    )

    foreach ($pattern in $patterns) {
        $match = [regex]::Match($Html, $pattern, [System.Text.RegularExpressions.RegexOptions]::IgnoreCase)
        if ($match.Success) { return $match.Groups['id'].Value }
    }

    return $null
}

function Get-YoutubeConfigFromHtml {
    param([Parameter(Mandatory)][string]$Html)

    $apiKey = Get-JsonStringValueFromText -Text $Html -PropertyName 'INNERTUBE_API_KEY'
    if ([string]::IsNullOrWhiteSpace($apiKey)) {
        throw 'Could not find INNERTUBE_API_KEY in the YouTube page HTML.'
    }

    return [pscustomobject]@{
        INNERTUBE_API_KEY        = $apiKey
        INNERTUBE_CLIENT_NAME    = Get-JsonStringValueFromText -Text $Html -PropertyName 'INNERTUBE_CLIENT_NAME' -DefaultValue 'WEB'
        INNERTUBE_CLIENT_VERSION = Get-JsonStringValueFromText -Text $Html -PropertyName 'INNERTUBE_CLIENT_VERSION' -DefaultValue '2.20260101.00.00'
        HL                       = Get-JsonStringValueFromText -Text $Html -PropertyName 'HL' -DefaultValue 'en'
        GL                       = Get-JsonStringValueFromText -Text $Html -PropertyName 'GL' -DefaultValue 'US'
    }
}

function Get-JsonFromHtml {
    param([Parameter(Mandatory)][string]$Html)

    $initialDataResult = Get-JsonObjectAfterMarker -Text $Html -Marker 'var ytInitialData = ' -MustHaveAnyTopLevelProperty @('contents', 'metadata')
    if (-not $initialDataResult) {
        $initialDataResult = Get-JsonObjectAfterMarker -Text $Html -Marker 'ytInitialData = ' -MustHaveAnyTopLevelProperty @('contents', 'metadata')
    }
    if (-not $initialDataResult) {
        throw 'Could not find usable ytInitialData JSON in the YouTube page HTML.'
    }

    return [pscustomobject]@{
        InitialData     = $initialDataResult.Object
        InitialDataText = $initialDataResult.Json
        Config          = Get-YoutubeConfigFromHtml -Html $Html
        ChannelId       = Get-YoutubeChannelIdFromHtml -Html $Html
    }
}

function Get-TextFromRuns {
    param($TextObject)

    if ($null -eq $TextObject) { return $null }
    if ($TextObject -is [string]) { return Decode-JsonishString $TextObject }

    $simpleText = Get-OptionalProperty -Object $TextObject -Name 'simpleText'
    if (-not [string]::IsNullOrWhiteSpace($simpleText)) { return Decode-JsonishString ([string]$simpleText) }

    $content = Get-OptionalProperty -Object $TextObject -Name 'content'
    if (-not [string]::IsNullOrWhiteSpace($content)) { return Decode-JsonishString ([string]$content) }

    $runs = Get-OptionalProperty -Object $TextObject -Name 'runs'
    if ($runs) {
        $text = (($runs | ForEach-Object { Get-OptionalProperty -Object $_ -Name 'text' }) -join '')
        if (-not [string]::IsNullOrWhiteSpace($text)) { return Decode-JsonishString $text }
    }

    $accessibility = Get-OptionalProperty -Object $TextObject -Name 'accessibility'
    $accessibilityData = Get-OptionalProperty -Object $accessibility -Name 'accessibilityData'
    $label = Get-OptionalProperty -Object $accessibilityData -Name 'label'
    if (-not [string]::IsNullOrWhiteSpace($label)) { return Decode-JsonishString ([string]$label) }

    return $null
}

function Get-AllObjectsFromJson {
    param([Parameter(Mandatory)]$Root)

    $objects = New-Object System.Collections.Generic.List[object]
    $visited = New-Object 'System.Collections.Generic.HashSet[int]'

    function Walk-Node {
        param($Current)

        if ($null -eq $Current) { return }

        if ($Current -is [pscustomobject]) {
            $hash = [System.Runtime.CompilerServices.RuntimeHelpers]::GetHashCode($Current)
            if (-not $visited.Add($hash)) { return }

            $objects.Add($Current)
            foreach ($prop in $Current.PSObject.Properties) { Walk-Node $prop.Value }
            return
        }

        if ($Current -is [System.Collections.IEnumerable] -and $Current -isnot [string]) {
            foreach ($item in $Current) { Walk-Node $item }
        }
    }

    Walk-Node $Root
    return $objects.ToArray()
}

function Get-FirstVideoIdFromNode {
    param([Parameter(Mandatory)]$Node)

    foreach ($name in @('videoId', 'contentId')) {
        $value = Get-OptionalProperty -Object $Node -Name $name
        if ($value -is [string] -and $value -match "^$VideoIdPattern$") { return $value }
    }

    $watchEndpoint = Get-OptionalProperty -Object $Node -Name 'watchEndpoint'
    $endpointVideoId = Get-OptionalProperty -Object $watchEndpoint -Name 'videoId'
    if ($endpointVideoId -is [string] -and $endpointVideoId -match "^$VideoIdPattern$") { return $endpointVideoId }

    $navigationEndpoint = Get-OptionalProperty -Object $Node -Name 'navigationEndpoint'
    $navWatchEndpoint = Get-OptionalProperty -Object $navigationEndpoint -Name 'watchEndpoint'
    $navVideoId = Get-OptionalProperty -Object $navWatchEndpoint -Name 'videoId'
    if ($navVideoId -is [string] -and $navVideoId -match "^$VideoIdPattern$") { return $navVideoId }

    $commandMetadata = Get-OptionalProperty -Object $Node -Name 'commandMetadata'
    $webCommandMetadata = Get-OptionalProperty -Object $commandMetadata -Name 'webCommandMetadata'
    $url = Get-OptionalProperty -Object $webCommandMetadata -Name 'url'
    if ($url -is [string]) {
        $urlMatch = [regex]::Match($url, '[?&]v=(?<id>[A-Za-z0-9_-]{11})')
        if ($urlMatch.Success) { return $urlMatch.Groups['id'].Value }
    }

    return $null
}

function Get-FirstTitleFromNode {
    param(
        [Parameter(Mandatory)]$Node,
        [bool]$RequireNumberedLiveStream = $true
    )

    $candidateText = New-Object System.Collections.Generic.List[string]

    foreach ($name in @('title', 'headline', 'videoTitle', 'text')) {
        $value = Get-OptionalProperty -Object $Node -Name $name
        $text = Get-TextFromRuns $value
        if (-not [string]::IsNullOrWhiteSpace($text)) { $candidateText.Add($text) }
    }

    $metadata = Get-OptionalProperty -Object $Node -Name 'metadata'
    $lockupMetadata = Get-OptionalProperty -Object $metadata -Name 'lockupMetadataViewModel'
    $lockupTitle = Get-OptionalProperty -Object $lockupMetadata -Name 'title'
    $lockupTitleText = Get-TextFromRuns $lockupTitle
    if (-not [string]::IsNullOrWhiteSpace($lockupTitleText)) { $candidateText.Add($lockupTitleText) }

    $accessibilityData = Get-OptionalProperty -Object $Node -Name 'accessibilityData'
    $label = Get-OptionalProperty -Object $accessibilityData -Name 'label'
    if (-not [string]::IsNullOrWhiteSpace($label)) { $candidateText.Add((Decode-JsonishString ([string]$label))) }

    if ($RequireNumberedLiveStream) {
        foreach ($text in $candidateText) {
            $titleMatch = [regex]::Match($text, 'Live\s+St(?:r)?eam\s*#\s*\d+\s*[:\-–—]?\s*[^\r\n,]*', 'IgnoreCase')
            if ($titleMatch.Success) { return $titleMatch.Value.Trim() }
        }
        return $null
    }

    foreach ($text in $candidateText) {
        $clean = (Decode-JsonishString $text).Trim()
        if ([string]::IsNullOrWhiteSpace($clean)) { continue }
        if ($clean -match '^\d+\s+(views?|watching)\b') { continue }
        if ($clean -match '^\d+\s+(minutes?|hours?|days?|weeks?|months?|years?)\s+ago\b') { continue }
        if ($clean.Length -gt 180) { continue }
        return $clean
    }

    return $null
}

function Add-VideoCandidate {
    param(
        [Parameter(Mandatory)]$ItemsById,
        [Parameter(Mandatory)][string]$VideoId,
        [Parameter(Mandatory)][string]$Title,
        [Parameter(Mandatory)][string]$SourceName,
        [bool]$RequireNumberedLiveStream = $true
    )

    if ($VideoId -notmatch "^$VideoIdPattern$") { return }

    $cleanTitle = (Decode-JsonishString $Title).Trim()
    if ([string]::IsNullOrWhiteSpace($cleanTitle)) { return }

    $titleInfo = Get-LiveStreamTitleInfo -Title $cleanTitle
    $isNumbered = [bool]$titleInfo.IsNumbered

    if ($RequireNumberedLiveStream -and -not $isNumbered) { return }

    $episodeNumber = if ($isNumbered) { [int]$titleInfo.Number } else { 0 }
    $cleanTitle = [string]$titleInfo.NormalizedTitle

    if (-not $ItemsById.Contains($VideoId)) {
        $ItemsById[$VideoId] = [pscustomobject]@{
            DisplayOrder = $script:NextArchiveDisplayOrder
            Number       = $episodeNumber
            Numbered     = $isNumbered
            Title        = $cleanTitle
            VideoId      = $VideoId
            Url          = "$BaseWatchUrl$VideoId"
            Slug         = ConvertTo-Slug -Title $cleanTitle
            FirstSource  = $SourceName
        }
        $script:NextArchiveDisplayOrder++
    }
}

function Add-VideoRendererCandidate {
    param(
        [Parameter(Mandatory)]$Renderer,
        [Parameter(Mandatory)]$ItemsById,
        [Parameter(Mandatory)][string]$SourceName,
        [bool]$RequireNumberedLiveStream = $true
    )

    $videoId = Get-FirstVideoIdFromNode -Node $Renderer
    if ([string]::IsNullOrWhiteSpace($videoId)) { return }

    $title = Get-FirstTitleFromNode -Node $Renderer -RequireNumberedLiveStream $RequireNumberedLiveStream
    if ([string]::IsNullOrWhiteSpace($title)) { return }

    Add-VideoCandidate -ItemsById $ItemsById -VideoId $videoId -Title $title -SourceName $SourceName -RequireNumberedLiveStream $RequireNumberedLiveStream
}

function Add-VideoItemsFromJson {
    param(
        [Parameter(Mandatory)]$JsonObject,
        [Parameter(Mandatory)]$ItemsById,
        [Parameter(Mandatory)][string]$SourceName,
        [bool]$RequireNumberedLiveStream = $true
    )

    # Do not do a blind recursive "any object with videoId" scan here.
    # That finds metadata, command endpoints, and other non-grid objects in an order that does not match the Live tab.
    # Instead, process known video renderer/card shapes while walking arrays in their natural order.
    function Walk-OrderedVideoNodes {
        param($Current)

        if ($null -eq $Current) { return }

        if ($Current -is [System.Collections.IEnumerable] -and $Current -isnot [string]) {
            foreach ($item in $Current) { Walk-OrderedVideoNodes $item }
            return
        }

        if ($Current -isnot [pscustomobject]) { return }

        foreach ($rendererName in @('videoRenderer', 'gridVideoRenderer', 'playlistVideoRenderer', 'lockupViewModel')) {
            $renderer = Get-OptionalProperty -Object $Current -Name $rendererName
            if ($null -ne $renderer) {
                Add-VideoRendererCandidate -Renderer $renderer -ItemsById $ItemsById -SourceName $SourceName -RequireNumberedLiveStream $RequireNumberedLiveStream
                return
            }
        }

        $richItemRenderer = Get-OptionalProperty -Object $Current -Name 'richItemRenderer'
        if ($null -ne $richItemRenderer) {
            $content = Get-OptionalProperty -Object $richItemRenderer -Name 'content'
            if ($null -ne $content) {
                Walk-OrderedVideoNodes $content
                return
            }
        }

        $richGridMedia = Get-OptionalProperty -Object $Current -Name 'richGridMedia'
        if ($null -ne $richGridMedia) {
            Walk-OrderedVideoNodes $richGridMedia
            return
        }

        # Recurse through object properties in JSON property order. Arrays inside renderer lists preserve the page order.
        foreach ($prop in $Current.PSObject.Properties) {
            Walk-OrderedVideoNodes $prop.Value
        }
    }

    Walk-OrderedVideoNodes $JsonObject
}

function Add-VideoItemsFromText {
    param(
        [Parameter(Mandatory)][string]$Text,
        [Parameter(Mandatory)]$ItemsById,
        [Parameter(Mandatory)][string]$SourceName
    )

    $regexOptions = [System.Text.RegularExpressions.RegexOptions]::Singleline -bor [System.Text.RegularExpressions.RegexOptions]::IgnoreCase

    $patterns = @(
        '"videoId"\s*:\s*"(?<id>[A-Za-z0-9_-]{11})".{0,5000}?"title"\s*:\s*\{\s*"runs"\s*:\s*\[\s*\{\s*"text"\s*:\s*"(?<title>Live\s+St(?:r)?eam\s*#\s*\d+(?:\\.|[^"\\])*)"',
        '"contentId"\s*:\s*"(?<id>[A-Za-z0-9_-]{11})".{0,5000}?"title"\s*:\s*\{\s*"content"\s*:\s*"(?<title>Live\s+St(?:r)?eam\s*#\s*\d+(?:\\.|[^"\\])*)"',
        '"watchEndpoint"\s*:\s*\{\s*"videoId"\s*:\s*"(?<id>[A-Za-z0-9_-]{11})".{0,5000}?"title"\s*:\s*\{[^}]*?(?:"simpleText"|"content")\s*:\s*"(?<title>Live\s+St(?:r)?eam\s*#\s*\d+(?:\\.|[^"\\])*)"',
        '"url"\s*:\s*"\/watch\?v=(?<id>[A-Za-z0-9_-]{11})(?:\\u0026|&|"|\\).{0,5000}?"(?<title>Live\s+St(?:r)?eam\s*#\s*\d+(?:\\.|[^"\\])*)"'
    )

    foreach ($pattern in $patterns) {
        $matches = [regex]::Matches($Text, $pattern, $regexOptions)
        foreach ($match in $matches) {
            Add-VideoCandidate -ItemsById $ItemsById -VideoId $match.Groups['id'].Value -Title $match.Groups['title'].Value -SourceName $SourceName -RequireNumberedLiveStream $true
        }
    }

    $titleThenIdPattern = '"(?<title>Live\s+St(?:r)?eam\s*#\s*\d+(?:\\.|[^"\\])*)".{0,2500}?(?:"videoId"\s*:\s*"|\/watch\?v=)(?<id>[A-Za-z0-9_-]{11})'
    $matchesTitleFirst = [regex]::Matches($Text, $titleThenIdPattern, $regexOptions)
    foreach ($match in $matchesTitleFirst) {
        Add-VideoCandidate -ItemsById $ItemsById -VideoId $match.Groups['id'].Value -Title $match.Groups['title'].Value -SourceName $SourceName -RequireNumberedLiveStream $true
    }
}

function Get-ContinuationTokensFromJson {
    param([Parameter(Mandatory)]$JsonObject)

    $tokens = New-Object System.Collections.Generic.List[string]

    foreach ($object in (Get-AllObjectsFromJson -Root $JsonObject)) {
        $continuationItemRenderer = Get-OptionalProperty -Object $object -Name 'continuationItemRenderer'
        $endpoint = Get-OptionalProperty -Object $continuationItemRenderer -Name 'continuationEndpoint'
        $command = Get-OptionalProperty -Object $endpoint -Name 'continuationCommand'
        $token = Get-OptionalProperty -Object $command -Name 'token'
        if (-not [string]::IsNullOrWhiteSpace($token)) { $tokens.Add([string]$token) }

        $directEndpoint = Get-OptionalProperty -Object $object -Name 'continuationEndpoint'
        $directCommand = Get-OptionalProperty -Object $directEndpoint -Name 'continuationCommand'
        $directToken = Get-OptionalProperty -Object $directCommand -Name 'token'
        if (-not [string]::IsNullOrWhiteSpace($directToken)) { $tokens.Add([string]$directToken) }

        $reloadContinuation = Get-OptionalProperty -Object $object -Name 'reloadContinuationData'
        $reloadToken = Get-OptionalProperty -Object $reloadContinuation -Name 'continuation'
        if (-not [string]::IsNullOrWhiteSpace($reloadToken)) { $tokens.Add([string]$reloadToken) }
    }

    return @($tokens.ToArray() | Select-Object -Unique)
}


function Get-ContinuationTokenFromItem {
    param([AllowNull()]$Item)

    if ($null -eq $Item -or $Item -isnot [pscustomobject]) { return $null }

    $continuationItemRenderer = Get-OptionalProperty -Object $Item -Name 'continuationItemRenderer'
    if ($null -eq $continuationItemRenderer) { return $null }

    $endpoint = Get-OptionalProperty -Object $continuationItemRenderer -Name 'continuationEndpoint'
    $command = Get-OptionalProperty -Object $endpoint -Name 'continuationCommand'
    $token = Get-OptionalProperty -Object $command -Name 'token'
    if (-not [string]::IsNullOrWhiteSpace($token)) { return [string]$token }

    $reloadContinuation = Get-OptionalProperty -Object $continuationItemRenderer -Name 'reloadContinuationData'
    $reloadToken = Get-OptionalProperty -Object $reloadContinuation -Name 'continuation'
    if (-not [string]::IsNullOrWhiteSpace($reloadToken)) { return [string]$reloadToken }

    return $null
}

function Add-ContinuationTokensFromItems {
    param(
        [AllowNull()]$Items,
        [Parameter(Mandatory)]$Tokens
    )

    if ($null -eq $Items) { return }

    if ($Items -is [System.Collections.IEnumerable] -and $Items -isnot [string]) {
        foreach ($item in $Items) {
            $token = Get-ContinuationTokenFromItem -Item $item
            if (-not [string]::IsNullOrWhiteSpace($token)) { $Tokens.Add($token) }
        }
    }
}

function Get-OrderedContinuationTokensFromJson {
    param([Parameter(Mandatory)]$JsonObject)

    $tokens = New-Object System.Collections.Generic.List[string]

    function Walk-ContinuationContainers {
        param($Current)

        if ($null -eq $Current) { return }

        if ($Current -is [System.Collections.IEnumerable] -and $Current -isnot [string]) {
            foreach ($item in $Current) { Walk-ContinuationContainers $item }
            return
        }

        if ($Current -isnot [pscustomobject]) { return }

        $directToken = Get-ContinuationTokenFromItem -Item $Current
        if (-not [string]::IsNullOrWhiteSpace($directToken)) { $tokens.Add($directToken) }

        foreach ($containerName in @('richGridRenderer', 'gridRenderer', 'sectionListRenderer', 'itemSectionRenderer')) {
            $container = Get-OptionalProperty -Object $Current -Name $containerName
            $contents = Get-OptionalProperty -Object $container -Name 'contents'
            Add-ContinuationTokensFromItems -Items $contents -Tokens $tokens
        }

        foreach ($actionName in @('appendContinuationItemsAction', 'reloadContinuationItemsCommand')) {
            $action = Get-OptionalProperty -Object $Current -Name $actionName
            $continuationItems = Get-OptionalProperty -Object $action -Name 'continuationItems'
            Add-ContinuationTokensFromItems -Items $continuationItems -Tokens $tokens
        }

        foreach ($prop in $Current.PSObject.Properties) {
            Walk-ContinuationContainers $prop.Value
        }
    }

    Walk-ContinuationContainers $JsonObject
    return @($tokens.ToArray() | Select-Object -Unique)
}

function Get-ContinuationTokensFromText {
    param([Parameter(Mandatory)][string]$Text)

    $tokens = New-Object System.Collections.Generic.List[string]
    $patterns = @(
        '"continuationCommand"\s*:\s*\{\s*"token"\s*:\s*"(?<token>(?:\\.|[^"\\])*)"',
        '"reloadContinuationData"\s*:\s*\{\s*"continuation"\s*:\s*"(?<token>(?:\\.|[^"\\])*)"'
    )

    foreach ($pattern in $patterns) {
        foreach ($match in [regex]::Matches($Text, $pattern, [System.Text.RegularExpressions.RegexOptions]::Singleline)) {
            $token = Decode-JsonishString $match.Groups['token'].Value
            if (-not [string]::IsNullOrWhiteSpace($token)) { $tokens.Add($token) }
        }
    }

    return @($tokens.ToArray() | Select-Object -Unique)
}

function New-InnertubeContext {
    param([Parameter(Mandatory)]$Config)

    $clientNameValue = Get-OptionalProperty -Object $Config -Name 'INNERTUBE_CLIENT_NAME'
    $clientVersionValue = Get-OptionalProperty -Object $Config -Name 'INNERTUBE_CLIENT_VERSION'
    $hlValue = Get-OptionalProperty -Object $Config -Name 'HL'
    $glValue = Get-OptionalProperty -Object $Config -Name 'GL'

    $clientName = if (-not [string]::IsNullOrWhiteSpace($clientNameValue)) { [string]$clientNameValue } else { 'WEB' }
    $clientVersion = if (-not [string]::IsNullOrWhiteSpace($clientVersionValue)) { [string]$clientVersionValue } else { '2.20260101.00.00' }
    $hl = if (-not [string]::IsNullOrWhiteSpace($hlValue)) { [string]$hlValue } else { 'en' }
    $gl = if (-not [string]::IsNullOrWhiteSpace($glValue)) { [string]$glValue } else { 'US' }

    return @{
        client = @{
            clientName    = $clientName
            clientVersion = $clientVersion
            hl            = $hl
            gl            = $gl
        }
    }
}

function Invoke-YoutubeContinuationText {
    param(
        [Parameter(Mandatory)][string]$ContinuationToken,
        [Parameter(Mandatory)]$Config,
        [Parameter(Mandatory)]$Context
    )

    $apiKey = [string](Get-OptionalProperty -Object $Config -Name 'INNERTUBE_API_KEY')
    if ([string]::IsNullOrWhiteSpace($apiKey)) { throw 'Could not find INNERTUBE_API_KEY in parsed YouTube config.' }

    $uri = "https://www.youtube.com/youtubei/v1/browse?key=$apiKey"
    $body = @{
        context      = $Context
        continuation = $ContinuationToken
    } | ConvertTo-Json -Depth 100 -Compress

    return (Invoke-WebRequest -Method Post -Uri $uri -Headers $Headers -ContentType 'application/json' -Body $body -TimeoutSec 30).Content
}

function Write-ArchiveMarkdown {
    param(
        [AllowEmptyCollection()][object[]]$Items = @(),
        [Parameter(Mandatory)][string]$Path
    )

    $lines = New-Object System.Collections.Generic.List[string]
    $lines.Add('# 📺 Ancient Egypt and the Bible – Livestream Archive')

    foreach ($item in $Items) {
        $safeTitle = $item.Title.Replace('[', '\[').Replace(']', '\]')
        $lines.Add("- [$safeTitle]($($item.Url)) ``$($item.Slug)``")
    }

    $directory = Split-Path -Parent $Path
    if (-not [string]::IsNullOrWhiteSpace($directory) -and -not (Test-Path $directory)) {
        New-Item -ItemType Directory -Path $directory | Out-Null
    }

    $lines | Set-Content -Path $Path -Encoding utf8
}

function Write-SourceDebugFiles {
    param(
        [Parameter(Mandatory)][string]$Directory,
        [Parameter(Mandatory)][string]$SourceName,
        [Parameter(Mandatory)][string]$PageHtml,
        [AllowNull()][string]$LastContinuationText
    )

    if (-not (Test-Path $Directory)) { New-Item -ItemType Directory -Path $Directory | Out-Null }

    $safeSourceName = ($SourceName.ToLowerInvariant() -replace '[^a-z0-9]+', '-') -replace '^-|-$', ''
    $PageHtml | Set-Content -Path (Join-Path $Directory "$safeSourceName-page.html") -Encoding utf8
    if (-not [string]::IsNullOrWhiteSpace($LastContinuationText)) {
        $LastContinuationText | Set-Content -Path (Join-Path $Directory "$safeSourceName-last-continuation.json") -Encoding utf8
    }
}

function Read-YoutubeBrowseSource {
    param(
        [Parameter(Mandatory)][string]$SourceName,
        [Parameter(Mandatory)][string]$InitialUrl,
        [Parameter(Mandatory)]$ItemsById,
        [bool]$IncludeUnnumberedFromThisSource = $false,
        [AllowNull()][string]$DebugDirectory = $null
    )

    Write-Host "Fetching ${SourceName}: $InitialUrl"
    $html = (Invoke-WebRequest -Uri $InitialUrl -Headers $Headers -TimeoutSec 30).Content
    $pageData = Get-JsonFromHtml -Html $html
    $context = New-InnertubeContext -Config $pageData.Config

    $seenContinuations = New-Object System.Collections.Generic.HashSet[string]
    $pendingContinuations = New-Object System.Collections.Generic.Queue[string]
    $lastContinuationText = $null
    $countAtStart = $ItemsById.Count

    # Parse only ordered renderer/card JSON by default. Raw text fallback is useful for diagnostics,
    # but it can discover older metadata out of sequence and break chronology.
    Add-VideoItemsFromJson -JsonObject $pageData.InitialData -ItemsById $ItemsById -SourceName $SourceName -RequireNumberedLiveStream:(-not $IncludeUnnumberedFromThisSource)
    if ($AllowRawTextFallback) {
        Write-Warning "[$SourceName] Raw-text fallback enabled. This can recover edge cases, but may break chronological order for any fallback-only entries."
        Add-VideoItemsFromText -Text $pageData.InitialDataText -ItemsById $ItemsById -SourceName $SourceName
        Add-VideoItemsFromText -Text $html -ItemsById $ItemsById -SourceName $SourceName
    }

    $initialTokens = New-Object System.Collections.Generic.List[string]
    foreach ($token in (Get-OrderedContinuationTokensFromJson -JsonObject $pageData.InitialData)) { $initialTokens.Add($token) }
    if ($AllowRawTextFallback) { foreach ($token in (Get-ContinuationTokensFromText -Text $html)) { $initialTokens.Add($token) } }

    foreach ($token in ($initialTokens.ToArray() | Select-Object -Unique)) {
        if ($seenContinuations.Add($token)) { $pendingContinuations.Enqueue($token) }
    }

    $continuationPagesRead = 0
    $staleContinuationPages = 0
    $stopReason = 'No continuation tokens remained.'

    while ($pendingContinuations.Count -gt 0) {
        if ($MaxVideos -gt 0 -and $ItemsById.Count -ge $MaxVideos) { $stopReason = "Reached MaxVideos=$MaxVideos."; break }
        if ($continuationPagesRead -ge $MaxContinuationPagesPerSource) {
            $stopReason = "Reached MaxContinuationPagesPerSource=$MaxContinuationPagesPerSource."
            Write-Warning "[$SourceName] $stopReason Items found so far: $($ItemsById.Count)"
            break
        }
        if ($MaxStaleContinuationPages -gt 0 -and $staleContinuationPages -ge $MaxStaleContinuationPages) {
            $stopReason = "Stopped after $staleContinuationPages continuation pages added no new matching streams."
            Write-Warning "[$SourceName] $stopReason Items found so far: $($ItemsById.Count)"
            break
        }

        $token = $pendingContinuations.Dequeue()
        Start-Sleep -Milliseconds $ContinuationDelayMs

        $continuationPagesRead++
        $countBeforePage = $ItemsById.Count
        Write-Host "[$SourceName] Following continuation token $continuationPagesRead... current items found: $($ItemsById.Count)"
        $lastContinuationText = Invoke-YoutubeContinuationText -ContinuationToken $token -Config $pageData.Config -Context $context

        try {
            $response = $lastContinuationText | ConvertFrom-Json -Depth 100 -ErrorAction Stop
            Add-VideoItemsFromJson -JsonObject $response -ItemsById $ItemsById -SourceName $SourceName -RequireNumberedLiveStream:(-not $IncludeUnnumberedFromThisSource)

            foreach ($nextToken in (Get-OrderedContinuationTokensFromJson -JsonObject $response)) {
                if ($seenContinuations.Add($nextToken)) { $pendingContinuations.Enqueue($nextToken) }
            }
        }
        catch {
            Write-Warning "[$SourceName] Could not parse continuation response as JSON on page $continuationPagesRead. Raw-text extraction is disabled unless -AllowRawTextFallback is used."
        }

        if ($AllowRawTextFallback) {
            Add-VideoItemsFromText -Text $lastContinuationText -ItemsById $ItemsById -SourceName $SourceName

            foreach ($nextToken in (Get-ContinuationTokensFromText -Text $lastContinuationText)) {
                if ($seenContinuations.Add($nextToken)) { $pendingContinuations.Enqueue($nextToken) }
            }
        }

        $countAfterPage = $ItemsById.Count
        $newCount = $countAfterPage - $countBeforePage
        if ($newCount -gt 0) {
            $staleContinuationPages = 0
            Write-Host "[$SourceName]   Added $newCount item(s); total items found: $countAfterPage"
        }
        else {
            $staleContinuationPages++
            Write-Host "[$SourceName]   Added 0 items; stale continuation pages: $staleContinuationPages/$MaxStaleContinuationPages"
        }
    }

    if ($MaxVideos -gt 0 -and $ItemsById.Count -ge $MaxVideos) { $stopReason = "Reached MaxVideos=$MaxVideos." }
    elseif ($pendingContinuations.Count -eq 0 -and $stopReason -eq 'No continuation tokens remained.') { $stopReason = 'No continuation tokens remained.' }

    Write-Host "[$SourceName] Continuation stop reason: $stopReason"

    if ($WriteDebugDump -and -not [string]::IsNullOrWhiteSpace($DebugDirectory)) {
        Write-SourceDebugFiles -Directory $DebugDirectory -SourceName $SourceName -PageHtml $html -LastContinuationText $lastContinuationText
    }

    return [pscustomobject]@{
        SourceName           = $SourceName
        InitialUrl           = $InitialUrl
        InitialHtml          = $html
        InitialData          = $pageData.InitialData
        Config               = $pageData.Config
        ChannelId            = $pageData.ChannelId
        PagesRead            = $continuationPagesRead
        AddedCount           = $ItemsById.Count - $countAtStart
        StopReason           = $stopReason
        LastContinuationText = $lastContinuationText
    }
}

function Get-MissingEpisodeNumbers {
    param([Parameter(Mandatory)][object[]]$Items)

    $numbers = @($Items | Where-Object { $_.Numbered -and $_.Number -gt 0 } | ForEach-Object { [int]$_.Number } | Sort-Object -Unique)
    if ($numbers.Count -eq 0) { return @() }

    $max = ($numbers | Measure-Object -Maximum).Maximum
    $numberSet = New-Object 'System.Collections.Generic.HashSet[int]'
    foreach ($n in $numbers) { [void]$numberSet.Add([int]$n) }

    $missing = New-Object System.Collections.Generic.List[int]
    for ($i = 1; $i -le $max; $i++) {
        if (-not $numberSet.Contains($i)) { $missing.Add($i) }
    }

    return $missing.ToArray()
}

if ($NoClobber -and (Test-Path $OutputPath)) { throw "Output file already exists: $OutputPath" }

$outputDirectory = Split-Path -Parent $OutputPath
$debugDirectory = if ([string]::IsNullOrWhiteSpace($outputDirectory)) { '.\youtube-stream-debug-v010' } else { Join-Path $outputDirectory 'youtube-stream-debug-v010' }

$allItemsById = [ordered]@{}
$sourceResults = New-Object System.Collections.Generic.List[object]
$metadataHtml = $null
$channelId = $null

if ($NumberedOnly -and $IncludeOtherLiveStreams) {
    Write-Warning 'Both -NumberedOnly and -IncludeOtherLiveStreams were supplied. -NumberedOnly wins in v010.'
}

if (-not $SkipStreamsTab) {
    $streamResult = Read-YoutubeBrowseSource -SourceName 'streams tab' -InitialUrl $StreamsUrl -ItemsById $allItemsById -IncludeUnnumberedFromThisSource:(-not [bool]$NumberedOnly) -DebugDirectory $debugDirectory
    $sourceResults.Add($streamResult)
    $metadataHtml = $streamResult.InitialHtml
    $channelId = $streamResult.ChannelId
}
else {
    Write-Host "Fetching metadata page for channel id: $StreamsUrl"
    $metadataHtml = (Invoke-WebRequest -Uri $StreamsUrl -Headers $Headers -TimeoutSec 30).Content
    $channelId = Get-YoutubeChannelIdFromHtml -Html $metadataHtml
}

if ($UseUploadsPlaylistFallback -and -not $SkipUploadsPlaylist) {
    Write-Warning 'Uploads playlist fallback was explicitly enabled. This can leave the strict /streams-tab scope and is intended for diagnostics only.'

    if ([string]::IsNullOrWhiteSpace($channelId)) {
        Write-Warning 'Could not determine channel id, so the uploads-playlist fallback was skipped.'
    }
    elseif (-not $channelId.StartsWith('UC')) {
        Write-Warning "Channel id did not have expected UC prefix: $channelId. Uploads-playlist fallback was skipped."
    }
    else {
        $uploadsPlaylistId = 'UU' + $channelId.Substring(2)
        $uploadsPlaylistUrl = "https://www.youtube.com/playlist?list=$uploadsPlaylistId"
        Write-Host "Derived uploads playlist id: $uploadsPlaylistId"
        $uploadsResult = Read-YoutubeBrowseSource -SourceName 'uploads playlist fallback' -InitialUrl $uploadsPlaylistUrl -ItemsById $allItemsById -IncludeUnnumberedFromThisSource:$false -DebugDirectory $debugDirectory
        $sourceResults.Add($uploadsResult)
    }
}
elseif ($SkipUploadsPlaylist) {
    Write-Host 'Uploads playlist fallback skipped. Default scope remains the /streams Live tab only.'
}

if ($SortByNumber) {
    $items = @(
        $allItemsById.Values |
            Sort-Object -Property @{ Expression = 'Numbered'; Descending = $true }, @{ Expression = 'Number'; Descending = $true }, @{ Expression = 'Title'; Descending = $false }
    )
}
else {
    $items = @(
        $allItemsById.Values |
            Sort-Object -Property @{ Expression = 'DisplayOrder'; Descending = ([bool]$OldestFirst) }
    )
}

if ($MaxVideos -gt 0) { $items = @($items | Select-Object -First $MaxVideos) }

if ($items.Count -eq 0) {
    throw "No matching livestream entries were found. Re-run with -AllowRawTextFallback and/or -WriteDebugDump to diagnose raw YouTube responses under: $debugDirectory"
}

Write-ArchiveMarkdown -Items $items -Path $OutputPath

$numberedItems = @($items | Where-Object { $_.Numbered })
$otherItems = @($items | Where-Object { -not $_.Numbered })
$highestNumber = 0
if ($numberedItems.Count -gt 0) { $highestNumber = ($numberedItems | Measure-Object -Property Number -Maximum).Maximum }
$missingNumbers = @(Get-MissingEpisodeNumbers -Items $items)

Write-Host "Wrote $($items.Count) archive entr$(if ($items.Count -eq 1) { 'y' } else { 'ies' }) to $OutputPath"
if ($SortByNumber) {
    Write-Host 'Output order: numbered-first archive order, newest numbered stream first.'
}
elseif ($OldestFirst) {
    Write-Host 'Output order: ordered /streams renderer order reversed, oldest first.'
}
else {
    Write-Host 'Output order: ordered /streams renderer order, newest first.'
}
Write-Host "Numbered Live Stream entries: $($numberedItems.Count). Highest number found: $highestNumber. Other stream entries included: $($otherItems.Count)."

foreach ($result in $sourceResults) {
    Write-Host "Source summary: $($result.SourceName) added $($result.AddedCount) unique matching item(s); pages read: $($result.PagesRead); stop: $($result.StopReason)"
}

if ($missingNumbers.Count -gt 0) {
    Write-Warning "Missing numbered Live Stream episode number(s) between 1 and ${highestNumber}: $($missingNumbers -join ', ')"
    Write-Warning 'Some gaps can be private/deleted/unlisted videos, titles that do not match the expected Live Stream # pattern, or items not exposed on the /streams tab.'
}

if ($NumberedOnly) {
    Write-Host 'NumberedOnly mode was used, so public Live-tab entries without a numbered "Live Stream #" title were excluded.'
}
elseif ($IncludeOtherLiveStreams) {
    Write-Host 'IncludeOtherLiveStreams was accepted for backward compatibility; all public /streams Live-tab streams are included by default in v010.'
}
