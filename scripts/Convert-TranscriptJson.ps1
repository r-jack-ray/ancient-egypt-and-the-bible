#requires -Version 7.0

[CmdletBinding()]
param(
    [Parameter(Mandatory = $true, Position = 0, ValueFromPipeline = $true, ValueFromPipelineByPropertyName = $true)]
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

    function Get-TranscriptSegments {
        param([pscustomobject] $JsonDocument)

        $segments = @(
            foreach ($action in @($JsonDocument.actions)) {
                $panel = $action.updateEngagementPanelAction
                if ($null -eq $panel) {
                    continue
                }

                $list = $panel.content.transcriptRenderer.content.transcriptSearchPanelRenderer.body.transcriptSegmentListRenderer
                if ($null -ne $list -and $null -ne $list.initialSegments) {
                    $list.initialSegments
                }
            }
        )

        if ($segments.Count -eq 0) {
            throw 'No transcript segments found. Expected YouTube transcript JSON with actions[].updateEngagementPanelAction...initialSegments.'
        }

        return $segments
    }

    function Get-TranscriptText {
        param([pscustomobject] $Renderer)

        if ($null -ne $Renderer.snippet.runs) {
            $text = ($Renderer.snippet.runs | ForEach-Object { $_.text }) -join ''
        }
        elseif ($null -ne $Renderer.snippet.simpleText) {
            $text = $Renderer.snippet.simpleText
        }
        else {
            $text = ''
        }

        return ($text -replace '[\r\n\t]+', ' ').Trim()
    }

    function Get-VideoId {
        param(
            [object[]] $Segments,
            [string] $Url
        )

        if (-not [string]::IsNullOrWhiteSpace($Url)) {
            if ($Url -match 'youtu\.be/([^?&/]+)') {
                return $Matches[1]
            }

            if ($Url -match '[?&]v=([^?&]+)') {
                return $Matches[1]
            }
        }

        foreach ($segment in $Segments) {
            $targetId = $segment.transcriptSegmentRenderer.targetId
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

        $rows = for ($i = 0; $i -lt $Segments.Count; $i++) {
            $renderer = $Segments[$i].transcriptSegmentRenderer
            if ($null -eq $renderer) {
                continue
            }

            $startMs = [int64] $renderer.startMs
            $endMs = if ($null -ne $renderer.endMs) { [int64] $renderer.endMs } else { $null }
            $startSeconds = [int] [Math]::Floor($startMs / 1000)
            $timestamp = $renderer.startTimeText.simpleText
            if ([string]::IsNullOrWhiteSpace($timestamp)) {
                $timestamp = Convert-SecondsToTimestamp -Seconds $startSeconds
            }

            $link = ''
            if (-not [string]::IsNullOrWhiteSpace($ResolvedVideoId)) {
                $link = "https://youtu.be/${ResolvedVideoId}?t=$startSeconds"
            }

            [pscustomobject] @{
                Index        = $i
                Timestamp    = $timestamp
                StartSeconds = $startSeconds
                StartMs      = $startMs
                EndMs        = $endMs
                Text         = Get-TranscriptText -Renderer $renderer
                Link         = $link
            }
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
        $segments = Get-TranscriptSegments -JsonDocument $document
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
