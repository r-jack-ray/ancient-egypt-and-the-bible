#requires -Version 7.0
<#
.SYNOPSIS
Converts a YouTube transcript JSON export into a plain TXT or TSV working transcript.

.DESCRIPTION
Use this script from the repository root to create generated transcript files for
Codex or manual transcript review. By default it reads a JSON file from
src/transcripts/json/ and writes a matching TXT file to src/transcripts/txt/.

The TXT output contains one transcript segment per line:

    [22] 3:58    okay um how prevalent were the gnostics in egypt

YouTube transcript exports can include non-transcript chapter/header markers in
the same list as transcript rows. Those markers are skipped.

Use TSV output when you need structured columns such as StartSeconds, StartMs,
EndMs, Text, and direct YouTube timestamp links.

.PARAMETER Path
One or more transcript JSON files to convert.

.PARAMETER Format
Output format. Use Txt for readable working transcripts or Tsv for structured
processing. Defaults to Txt.

.PARAMETER OutputRoot
Optional output folder. Defaults to src/transcripts/txt/ for Txt and
src/transcripts/tsv/ for Tsv.

.PARAMETER VideoUrl
Optional YouTube URL used to build timestamp links. The script usually infers
the video ID from the transcript segment target IDs, so this is only needed if
inference fails or you want to override it.

.PARAMETER NoClobber
Fails if the output file already exists. Without this switch, generated output
is overwritten so repeated processing stays simple.

.EXAMPLE
pwsh -NoProfile -File scripts/Convert-TranscriptJson.ps1 src/transcripts/json/12-the-quorum-of-the-twelve.json

Creates src/transcripts/txt/12-the-quorum-of-the-twelve.txt.

.EXAMPLE
pwsh -NoProfile -File scripts/Convert-TranscriptJson.ps1 src/transcripts/json/12-the-quorum-of-the-twelve.json -Format Tsv

Creates src/transcripts/tsv/12-the-quorum-of-the-twelve.tsv.

.EXAMPLE
Get-ChildItem src/transcripts/json/14-*.json,src/transcripts/json/15-*.json | pwsh -NoProfile -File scripts/Convert-TranscriptJson.ps1

Converts multiple JSON files supplied through the pipeline.
#>

[CmdletBinding()]
param(
    [Parameter(Mandatory = $true, Position = 0, ValueFromPipeline = $true, ValueFromPipelineByPropertyName = $true, ValueFromRemainingArguments = $true)]
    [Alias('FullName')]
    [string[]] $Path,

    [ValidateSet('Txt', 'Tsv')]
    [string] $Format = 'Txt',

    [string] $OutputRoot,

    [string] $VideoUrl,

    [switch] $NoClobber
)

begin {
    Set-StrictMode -Version Latest
    $ErrorActionPreference = 'Stop'

    function Resolve-RepositoryRoot {
        param([string] $StartPath)

        $current = (Resolve-Path -LiteralPath $StartPath).Path
        if (Test-Path -LiteralPath $current -PathType Leaf) {
            $current = Split-Path -Path $current -Parent
        }

        while ($current) {
            $jsonRoot = Join-Path -Path $current -ChildPath 'src/transcripts/json'
            if (Test-Path -LiteralPath $jsonRoot -PathType Container) {
                return $current
            }

            $parent = Split-Path -Path $current -Parent
            if ($parent -eq $current) {
                break
            }

            $current = $parent
        }

        throw "Could not find repository root from '$StartPath'. Expected src/transcripts/json."
    }

    function Convert-SecondsToTimestamp {
        param([int] $Seconds)

        $span = [TimeSpan]::FromSeconds($Seconds)
        if ($span.TotalHours -ge 1) {
            return '{0}:{1:00}:{2:00}' -f [int] $span.TotalHours, $span.Minutes, $span.Seconds
        }

        return '{0}:{1:00}' -f $span.Minutes, $span.Seconds
    }

    function Get-ObjectPropertyValue {
        param(
            [object] $InputObject,
            [string] $Name
        )

        if ($null -eq $InputObject) {
            return $null
        }

        $property = $InputObject.PSObject.Properties[$Name]
        if ($null -eq $property) {
            return $null
        }

        return $property.Value
    }

    function Get-NestedObjectPropertyValue {
        param(
            [object] $InputObject,
            [string[]] $PropertyPath
        )

        $current = $InputObject
        foreach ($propertyName in $PropertyPath) {
            $current = Get-ObjectPropertyValue -InputObject $current -Name $propertyName
            if ($null -eq $current) {
                return $null
            }
        }

        return $current
    }

    function Get-TranscriptSegmentRenderer {
        param([object] $Segment)

        return Get-ObjectPropertyValue -InputObject $Segment -Name 'transcriptSegmentRenderer'
    }

    function Get-TranscriptSegmentEntries {
        param([object] $JsonDocument)

        $entries = @(
            foreach ($action in @(Get-ObjectPropertyValue -InputObject $JsonDocument -Name 'actions')) {
                $panel = Get-ObjectPropertyValue -InputObject $action -Name 'updateEngagementPanelAction'
                if ($null -eq $panel) {
                    continue
                }

                $list = Get-NestedObjectPropertyValue -InputObject $panel -PropertyPath @(
                    'content'
                    'transcriptRenderer'
                    'content'
                    'transcriptSearchPanelRenderer'
                    'body'
                    'transcriptSegmentListRenderer'
                )
                $initialSegments = Get-ObjectPropertyValue -InputObject $list -Name 'initialSegments'
                if ($null -ne $initialSegments) {
                    $initialSegments
                }
            }
        )

        if ($entries.Count -eq 0) {
            throw 'No transcript segments found. Expected YouTube transcript JSON with actions[].updateEngagementPanelAction...initialSegments.'
        }

        return $entries
    }

    function Get-TranscriptText {
        param([object] $Renderer)

        $snippet = Get-ObjectPropertyValue -InputObject $Renderer -Name 'snippet'
        $runs = Get-ObjectPropertyValue -InputObject $snippet -Name 'runs'
        $simpleText = Get-ObjectPropertyValue -InputObject $snippet -Name 'simpleText'

        if ($null -ne $runs) {
            $text = ($runs | ForEach-Object { Get-ObjectPropertyValue -InputObject $_ -Name 'text' }) -join ''
        }
        elseif ($null -ne $simpleText) {
            $text = $simpleText
        }
        else {
            $text = ''
        }

        return ($text -replace '[\r\n\t]+', ' ').Trim()
    }

    function Get-YouTubeVideoIdFromUrl {
        param([string] $Url)

        if ([string]::IsNullOrWhiteSpace($Url)) {
            return ''
        }

        if ($Url -match '^[A-Za-z0-9_-]{8,}$') {
            return $Url
        }

        if ($Url -match 'youtu\.be/([^?&/]+)') {
            return $Matches[1]
        }

        if ($Url -match '[?&]v=([^?&]+)') {
            return $Matches[1]
        }

        if ($Url -match 'youtube\.com/(?:embed|live|shorts)/([^?&/]+)') {
            return $Matches[1]
        }

        return ''
    }

    function Get-VideoId {
        param(
            [object[]] $Segments,
            [string] $Url
        )

        $videoIdFromUrl = Get-YouTubeVideoIdFromUrl -Url $Url
        if (-not [string]::IsNullOrWhiteSpace($videoIdFromUrl)) {
            return $videoIdFromUrl
        }

        foreach ($segment in $Segments) {
            $renderer = Get-TranscriptSegmentRenderer -Segment $segment
            if ($null -eq $renderer) {
                continue
            }

            $targetId = Get-ObjectPropertyValue -InputObject $renderer -Name 'targetId'
            if ([string]::IsNullOrWhiteSpace($targetId)) {
                continue
            }

            $candidate = ($targetId -split '\.')[0]
            if ($candidate -match '^[A-Za-z0-9_-]{8,}$') {
                return $candidate
            }
        }

        return ''
    }

    function Convert-TranscriptRows {
        param(
            [object[]] $Segments,
            [string] $ResolvedVideoId
        )

        $rowIndex = 0
        $rows = @(
            foreach ($segment in $Segments) {
                $renderer = Get-TranscriptSegmentRenderer -Segment $segment
                if ($null -eq $renderer) {
                    continue
                }

                $startMsValue = Get-ObjectPropertyValue -InputObject $renderer -Name 'startMs'
                if ([string]::IsNullOrWhiteSpace($startMsValue)) {
                    throw 'Transcript segment is missing startMs.'
                }

                $startMs = [int64] $startMsValue
                $endMsValue = Get-ObjectPropertyValue -InputObject $renderer -Name 'endMs'
                $endMs = if (-not [string]::IsNullOrWhiteSpace($endMsValue)) { [int64] $endMsValue } else { $null }
                $startSeconds = [int] [Math]::Floor($startMs / 1000)
                $timestamp = Get-NestedObjectPropertyValue -InputObject $renderer -PropertyPath @('startTimeText', 'simpleText')
                if ([string]::IsNullOrWhiteSpace($timestamp)) {
                    $timestamp = Convert-SecondsToTimestamp -Seconds $startSeconds
                }

                $link = ''
                if (-not [string]::IsNullOrWhiteSpace($ResolvedVideoId)) {
                    $link = "https://youtu.be/${ResolvedVideoId}?t=$startSeconds"
                }

                [pscustomobject] @{
                    Index        = $rowIndex
                    Timestamp    = $timestamp
                    StartSeconds = $startSeconds
                    StartMs      = $startMs
                    EndMs        = $endMs
                    Text         = Get-TranscriptText -Renderer $renderer
                    Link         = $link
                }
                $rowIndex++
            }
        )

        if ($rows.Count -eq 0) {
            throw 'No transcript rows found. The JSON contained transcript metadata but no transcriptSegmentRenderer entries.'
        }

        return @($rows)
    }

    function Format-TranscriptAsTxt {
        param([object[]] $Rows)

        foreach ($row in $Rows) {
            '[{0}] {1}{2}{3}' -f $row.Index, $row.Timestamp, "`t", $row.Text
        }
    }

    function Format-TranscriptAsTsv {
        param([object[]] $Rows)

        'Index' + "`t" + 'Timestamp' + "`t" + 'StartSeconds' + "`t" + 'StartMs' + "`t" + 'EndMs' + "`t" + 'Text' + "`t" + 'Link'
        foreach ($row in $Rows) {
            @(
                $row.Index
                $row.Timestamp
                $row.StartSeconds
                $row.StartMs
                $row.EndMs
                $row.Text
                $row.Link
            ) -join "`t"
        }
    }
}

process {
    foreach ($inputPath in $Path) {
        $resolvedPath = (Resolve-Path -LiteralPath $inputPath).Path
        $repoRoot = Resolve-RepositoryRoot -StartPath $resolvedPath

        if ([string]::IsNullOrWhiteSpace($OutputRoot)) {
            $outputFolderName = if ($Format -eq 'Tsv') { 'tsv' } else { 'txt' }
            $targetRoot = Join-Path -Path $repoRoot -ChildPath "src/transcripts/$outputFolderName"
        }
        else {
            $targetRoot = $OutputRoot
        }

        New-Item -ItemType Directory -Path $targetRoot -Force | Out-Null

        $extension = if ($Format -eq 'Tsv') { '.tsv' } else { '.txt' }
        $baseName = [IO.Path]::GetFileNameWithoutExtension($resolvedPath)
        $outputPath = Join-Path -Path $targetRoot -ChildPath "$baseName$extension"

        if ((Test-Path -LiteralPath $outputPath) -and $NoClobber) {
            throw "Output file already exists: $outputPath. Remove -NoClobber to overwrite generated output."
        }

        $document = Get-Content -LiteralPath $resolvedPath -Raw | ConvertFrom-Json
        $segments = Get-TranscriptSegmentEntries -JsonDocument $document
        $videoId = Get-VideoId -Segments $segments -Url $VideoUrl
        $rows = Convert-TranscriptRows -Segments $segments -ResolvedVideoId $videoId

        $outputLines = if ($Format -eq 'Tsv') {
            Format-TranscriptAsTsv -Rows $rows
        }
        else {
            Format-TranscriptAsTxt -Rows $rows
        }

        Set-Content -LiteralPath $outputPath -Value $outputLines -Encoding utf8NoBOM

        [pscustomobject] @{
            Source   = $resolvedPath
            Output   = $outputPath
            Format   = $Format
            Segments = $rows.Count
        }
    }
}
