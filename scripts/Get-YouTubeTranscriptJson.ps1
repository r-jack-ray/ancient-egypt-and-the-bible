#requires -Version 7.0
<#
.SYNOPSIS
Downloads YouTube transcript JSON files for every stream entry in src/live-stream-list.md.

.DESCRIPTION
Use this from the repository root to pull transcript JSON files into src/transcripts/json/.

Dependency note:
  This script uses the Python package `youtube-transcript-api`, not the official YouTube Data API.
  The package retrieves public YouTube captions/transcripts without an API key and without a browser.
  Install it in the Python environment used by `python`:

      python -m pip install --upgrade youtube-transcript-api

Important format note:
  `youtube-transcript-api` returns a simple snippet schema:
      text, start, duration

  The existing project converter, scripts/Convert-TranscriptJson.ps1, expects the browser transcript-panel
  JSON shape from YouTube:
      actions[].updateEngagementPanelAction...initialSegments[].transcriptSegmentRenderer

  To keep this project workflow simple, this script writes a "panel-like" JSON wrapper by default.
  It is not a byte-for-byte YouTube browser export, but it contains the fields used by the converter:
      startMs, endMs, snippet.runs[].text, startTimeText.simpleText, targetId

  Use -RawApiFormat if you want to preserve the direct `youtube-transcript-api` output for auditing
  or future tooling.

.PARAMETER IndexPath
Markdown index containing lines like:
  - [Live Stream #209: One-Meaning Flippancy](https://www.youtube.com/watch?v=H6CBCG9YX4U) `209-one-meaning-flippancy`

.PARAMETER OutputRoot
Folder where transcript JSON files are written. Defaults to src/transcripts/json.

.PARAMETER Episode
Optional numbered livestream episodes to pull, such as -Episode 209 or -Episode 118,162,209. This filter intentionally only applies to slugs that begin with a number. Omit -Episode to pull every indexed stream, including special streams and non-numbered entries.

.PARAMETER Slug
Optional transcript slugs to pull, such as -Slug 209-one-meaning-flippancy or -Slug special-live-stream-reliquary-of-the-dead-qa.

.PARAMETER MissingOnly
Only pull files that do not exist or are empty.

.PARAMETER Force
Overwrite existing non-empty output files.

.PARAMETER Languages
Language priority list. Defaults to English: en.

.PARAMETER TimeoutSeconds
Maximum seconds to allow one Python transcript pull attempt before marking it TimedOut. Defaults to 45.

.PARAMETER RawApiFormat
Write the direct `youtube-transcript-api` style JSON instead of panel-like converter-compatible JSON.

.PARAMETER ListOnly
Parse the index and show what would be pulled without downloading anything.

.EXAMPLE
pwsh -NoProfile -File scripts/Get-YouTubeTranscriptJson.ps1 -Episode 209 -MissingOnly

.EXAMPLE
pwsh -NoProfile -File scripts/Get-YouTubeTranscriptJson.ps1 -Episode 118,162,209 -Force

.EXAMPLE
pwsh -NoProfile -File scripts/Get-YouTubeTranscriptJson.ps1 -MissingOnly

.EXAMPLE
pwsh -NoProfile -File scripts/Get-YouTubeTranscriptJson.ps1 -Slug 209-one-meaning-flippancy -RawApiFormat
#>

[CmdletBinding()]
param(
    [string] $IndexPath = 'src/live-stream-list.md',
    [string] $OutputRoot = 'src/transcripts/json',

    [int[]] $Episode = @(),
    [string[]] $Slug = @(),

    [switch] $MissingOnly,
    [switch] $Force,
    [string[]] $Languages = @('en'),
    [int] $DelaySeconds = 1,
    [int] $TimeoutSeconds = 45,
    [switch] $RawApiFormat,
    [switch] $ListOnly
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function Resolve-RepositoryRoot {
    param([string] $StartPath)

    $current = (Resolve-Path -LiteralPath $StartPath).Path
    if (Test-Path -LiteralPath $current -PathType Leaf) {
        $current = Split-Path -Path $current -Parent
    }

    while ($current) {
        if ((Test-Path -LiteralPath (Join-Path $current 'src')) -and
            (Test-Path -LiteralPath (Join-Path $current 'scripts'))) {
            return $current
        }

        $parent = Split-Path -Path $current -Parent
        if ($parent -eq $current) { break }
        $current = $parent
    }

    throw "Could not find repository root from '$StartPath'."
}

function Get-YouTubeVideoIdFromUrl {
    param([string] $Url)

    if ([string]::IsNullOrWhiteSpace($Url)) { return '' }

    if ($Url -match 'youtu\.be/([^?&/]+)') { return $Matches[1] }
    if ($Url -match '[?&]v=([^?&]+)') { return $Matches[1] }
    if ($Url -match 'youtube\.com/(?:embed|live|shorts)/([^?&/]+)') { return $Matches[1] }

    return ''
}

function Get-EpisodeNumberFromSlug {
    param([string] $SlugValue)

    if ($SlugValue -match '^(\d+)-') {
        return [int] $Matches[1]
    }

    return $null
}

function Convert-SecondsToTimestamp {
    param([double] $Seconds)

    $wholeSeconds = [int] [Math]::Floor($Seconds)
    $span = [TimeSpan]::FromSeconds($wholeSeconds)

    if ($span.TotalHours -ge 1) {
        return '{0}:{1:00}:{2:00}' -f [int] $span.TotalHours, $span.Minutes, $span.Seconds
    }

    return '{0}:{1:00}' -f $span.Minutes, $span.Seconds
}

function Get-LiveStreamIndexEntries {
    param([string] $Path)

    $content = Get-Content -LiteralPath $Path -Raw

    # Matches markdown entries such as:
    # - [Live Stream #209: Title](https://www.youtube.com/watch?v=ID) `209-title`
    # - [Special Live Stream: Title](https://www.youtube.com/watch?v=ID) `special-live-stream-title`
    # This intentionally keys on the slug. The default pull includes every matched entry.
    # The -Episode filter applies only to numeric slug prefixes; use -Slug for non-numbered entries.
    $pattern = '\[(?<title>[^\]]+)\]\((?<url>https?://[^)]+)\)\s+`(?<slug>[^`]+)`'
    $matches = [regex]::Matches($content, $pattern)

    foreach ($match in $matches) {
        $slugValue = $match.Groups['slug'].Value
        $videoUrl = $match.Groups['url'].Value
        $videoId = Get-YouTubeVideoIdFromUrl -Url $videoUrl
        $episodeNumber = Get-EpisodeNumberFromSlug -SlugValue $slugValue

        [pscustomobject] @{
            Title = $match.Groups['title'].Value
            Url = $videoUrl
            VideoId = $videoId
            Slug = $slugValue
            Episode = $episodeNumber
        }
    }
}

function Invoke-TranscriptDownload {
    param(
        [string] $VideoId,
        [string] $OutputPath,
        [string[]] $LanguageList,
        [bool] $WriteRawApiFormat,
        [int] $TimeoutSeconds
    )

    $pythonCode = @'
import json
import math
import sys
from pathlib import Path

def emit(payload):
    print(json.dumps(payload, ensure_ascii=False))
    sys.exit(0)

try:
    from youtube_transcript_api import YouTubeTranscriptApi
except Exception as exc:
    emit({
        "ok": False,
        "errorType": type(exc).__name__,
        "message": "Missing dependency: youtube-transcript-api. Install with: python -m pip install --upgrade youtube-transcript-api",
    })

def timestamp(seconds: float) -> str:
    whole = int(math.floor(seconds))
    hours = whole // 3600
    minutes = (whole % 3600) // 60
    secs = whole % 60
    if hours:
        return f"{hours}:{minutes:02d}:{secs:02d}"
    return f"{minutes}:{secs:02d}"

def short_message(exc) -> str:
    text = str(exc).strip()
    # youtube-transcript-api exception text is intentionally verbose. Keep the first meaningful line.
    for line in text.splitlines():
        line = line.strip()
        if line:
            return line
    return type(exc).__name__

def fetch_transcript_with_fallbacks(api, video_id, languages):
    errors = []

    try:
        return api.fetch(video_id, languages=languages)
    except Exception as exc:
        errors.append(("api.fetch", exc))

    try:
        transcript_list = api.list(video_id)
    except Exception as exc:
        errors.append(("api.list", exc))
        raise exc

    try:
        return transcript_list.find_generated_transcript(languages).fetch()
    except Exception as exc:
        errors.append(("find_generated_transcript", exc))

    try:
        return transcript_list.find_transcript(languages).fetch()
    except Exception as exc:
        errors.append(("find_transcript", exc))

    wanted = {lang.lower() for lang in languages}
    available = list(transcript_list)

    for transcript in available:
        language_code = str(getattr(transcript, "language_code", "")).lower()
        is_generated = bool(getattr(transcript, "is_generated", False))
        if is_generated and language_code in wanted:
            return transcript.fetch()

    generated = [t for t in available if bool(getattr(t, "is_generated", False))]
    if len(generated) == 1:
        return generated[0].fetch()

    raise errors[0][1]

try:
    video_id = sys.argv[1]
    output_path = Path(sys.argv[2])
    languages = json.loads(sys.argv[3])
    raw_api_format = sys.argv[4].lower() == "true"

    ytt_api = YouTubeTranscriptApi()
    fetched = fetch_transcript_with_fallbacks(ytt_api, video_id, languages)
    raw_rows = fetched.to_raw_data()

    if raw_api_format:
        document = {
            "source": "youtube-transcript-api",
            "schemaVersion": 1,
            "videoId": fetched.video_id,
            "language": fetched.language,
            "languageCode": fetched.language_code,
            "isGenerated": fetched.is_generated,
            "snippets": raw_rows,
        }
    else:
        initial_segments = []
        for index, row in enumerate(raw_rows):
            start_seconds = float(row.get("start", 0.0))
            duration_seconds = float(row.get("duration", 0.0))
            start_ms = int(round(start_seconds * 1000))
            end_ms = int(round((start_seconds + duration_seconds) * 1000))
            text = str(row.get("text", ""))

            initial_segments.append({
                "transcriptSegmentRenderer": {
                    "startMs": str(start_ms),
                    "endMs": str(end_ms),
                    "snippet": {
                        "runs": [
                            {
                                "text": text
                            }
                        ]
                    },
                    "startTimeText": {
                        "simpleText": timestamp(start_seconds)
                    },
                    "targetId": f"{video_id}.transcript-api.{index}"
                }
            })

        document = {
            "source": "youtube-transcript-api",
            "sourceNote": "Panel-like wrapper generated for this repository; not a byte-for-byte YouTube browser transcript-panel export.",
            "schemaVersion": 1,
            "videoId": fetched.video_id,
            "language": fetched.language,
            "languageCode": fetched.language_code,
            "isGenerated": fetched.is_generated,
            "actions": [
                {
                    "updateEngagementPanelAction": {
                        "content": {
                            "transcriptRenderer": {
                                "content": {
                                    "transcriptSearchPanelRenderer": {
                                        "body": {
                                            "transcriptSegmentListRenderer": {
                                                "initialSegments": initial_segments
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            ]
        }

    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(json.dumps(document, ensure_ascii=False, indent=2), encoding="utf-8")

    emit({
        "ok": True,
        "videoId": video_id,
        "output": str(output_path),
        "segments": len(raw_rows),
        "language": fetched.language_code,
        "isGenerated": fetched.is_generated,
    })
except Exception as exc:
    emit({
        "ok": False,
        "videoId": sys.argv[1] if len(sys.argv) > 1 else "",
        "errorType": type(exc).__name__,
        "message": short_message(exc),
    })
'@

    $languageJson = $LanguageList | ConvertTo-Json -Compress
    $rawFlag = if ($WriteRawApiFormat) { 'true' } else { 'false' }

    # Run Python in a background job so one video cannot hang the whole pull.
    $job = Start-Job -ScriptBlock {
        param($Code, $VideoIdArg, $OutputPathArg, $LanguageJsonArg, $RawFlagArg)
        & python -c $Code $VideoIdArg $OutputPathArg $LanguageJsonArg $RawFlagArg 2>&1
    } -ArgumentList $pythonCode, $VideoId, $OutputPath, $languageJson, $rawFlag

    $finished = Wait-Job -Job $job -Timeout $TimeoutSeconds

    if (-not $finished) {
        Stop-Job -Job $job -ErrorAction SilentlyContinue | Out-Null
        Remove-Job -Job $job -Force -ErrorAction SilentlyContinue
        return [pscustomobject] @{
            ok = $false
            videoId = $VideoId
            errorType = 'TimedOut'
            message = "Timed out after $TimeoutSeconds seconds"
        }
    }

    $resultLines = Receive-Job -Job $job
    Remove-Job -Job $job -Force -ErrorAction SilentlyContinue

    $resultJson = ($resultLines | Select-Object -Last 1)

    try {
        return $resultJson | ConvertFrom-Json
    }
    catch {
        return [pscustomobject] @{
            ok = $false
            videoId = $VideoId
            errorType = 'UnparseablePythonOutput'
            message = ($resultLines -join ' ')
        }
    }
}

$repoRoot = Resolve-RepositoryRoot -StartPath (Get-Location).Path
$resolvedIndexPath = Join-Path -Path $repoRoot -ChildPath $IndexPath
$resolvedOutputRoot = Join-Path -Path $repoRoot -ChildPath $OutputRoot

if (-not (Test-Path -LiteralPath $resolvedIndexPath -PathType Leaf)) {
    throw "Index file not found: $resolvedIndexPath"
}

New-Item -ItemType Directory -Path $resolvedOutputRoot -Force | Out-Null

$entries = @(Get-LiveStreamIndexEntries -Path $resolvedIndexPath)

if ($Episode.Count -gt 0) {
    # Episode filtering is intentionally numeric-only.
    # Omit -Episode to pull every indexed stream, including special/non-numbered streams.
    $episodeSet = [System.Collections.Generic.HashSet[int]]::new()
    foreach ($number in $Episode) { [void] $episodeSet.Add($number) }
    $entries = @($entries | Where-Object { $null -ne $_.Episode -and $episodeSet.Contains([int] $_.Episode) })
}

if ($Slug.Count -gt 0) {
    $slugSet = [System.Collections.Generic.HashSet[string]]::new([StringComparer]::OrdinalIgnoreCase)
    foreach ($slugValue in $Slug) { [void] $slugSet.Add($slugValue) }
    $entries = @($entries | Where-Object { $slugSet.Contains($_.Slug) })
}

if ($entries.Count -eq 0) {
    throw 'No matching livestream entries found.'
}

$results = @()

foreach ($entry in $entries) {
    if ([string]::IsNullOrWhiteSpace($entry.VideoId)) {
        $results += [pscustomobject] @{
            Slug = $entry.Slug
            VideoId = ''
            Output = ''
            Status = 'Skipped'
            Message = 'Could not parse YouTube video ID.'
        }
        continue
    }

    $outputPath = Join-Path -Path $resolvedOutputRoot -ChildPath "$($entry.Slug).json"
    Write-Host ("Checking {0} ({1})" -f $entry.Slug, $entry.VideoId)
    $exists = Test-Path -LiteralPath $outputPath -PathType Leaf
    $nonEmpty = $exists -and ((Get-Item -LiteralPath $outputPath).Length -gt 0)

    if ($MissingOnly -and $nonEmpty) {
        Write-Host "  skipped: existing non-empty file"
        $results += [pscustomobject] @{
            Slug = $entry.Slug
            VideoId = $entry.VideoId
            Output = $outputPath
            Status = 'Skipped'
            Message = 'Existing non-empty file; -MissingOnly set.'
        }
        continue
    }

    if ($nonEmpty -and -not $Force) {
        Write-Host "  skipped: existing non-empty file; use -Force to overwrite"
        $results += [pscustomobject] @{
            Slug = $entry.Slug
            VideoId = $entry.VideoId
            Output = $outputPath
            Status = 'Skipped'
            Message = 'Existing non-empty file; use -Force to overwrite.'
        }
        continue
    }

    if ($ListOnly) {
        $results += [pscustomobject] @{
            Slug = $entry.Slug
            VideoId = $entry.VideoId
            Output = $outputPath
            Status = 'WouldPull'
            Message = $entry.Title
        }
        continue
    }

    Write-Host ("  pulling transcript; timeout={0}s" -f $TimeoutSeconds)
    $download = Invoke-TranscriptDownload `
        -VideoId $entry.VideoId `
        -OutputPath $outputPath `
        -LanguageList $Languages `
        -WriteRawApiFormat ([bool] $RawApiFormat) `
        -TimeoutSeconds $TimeoutSeconds

    if ($download.ok) {
        Write-Host ("  pulled: {0} segments" -f $download.segments)
        $results += [pscustomobject] @{
            Slug = $entry.Slug
            VideoId = $entry.VideoId
            Output = $outputPath
            Status = 'Pulled'
            Message = "$($download.segments) segments; language=$($download.language); generated=$($download.isGenerated)"
        }
    }
    else {
        $status = switch -Regex ($download.errorType) {
            'TranscriptsDisabled|NoTranscriptFound|NoTranscriptAvailable' { 'NoTranscript'; break }
            'IpBlocked|RequestBlocked' { 'Blocked'; break }
            'TimedOut' { 'TimedOut'; break }
            default { 'Failed' }
        }

        Write-Host ("  {0}: {1}" -f $status, $download.message)
        $results += [pscustomobject] @{
            Slug = $entry.Slug
            VideoId = $entry.VideoId
            Output = $outputPath
            Status = $status
            Message = "$($download.errorType): $($download.message)"
        }
    }

    if ($DelaySeconds -gt 0) {
        Start-Sleep -Seconds $DelaySeconds
    }
}


$timestamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$scriptDirectory = if ($PSCommandPath) { Split-Path -Path $PSCommandPath -Parent } else { (Get-Location).Path }
$summaryPath = Join-Path -Path $scriptDirectory -ChildPath "Get-YouTubeTranscriptJson.run-summary.$timestamp.md"

$statusGroups = $results | Group-Object -Property Status | Sort-Object -Property Name
$noTranscript = @($results | Where-Object { $_.Status -eq 'NoTranscript' })
$blocked = @($results | Where-Object { $_.Status -eq 'Blocked' })
$failed = @($results | Where-Object { $_.Status -eq 'Failed' })
$timedOut = @($results | Where-Object { $_.Status -eq 'TimedOut' })

$summaryLines = @()
$summaryLines += "# YouTube Transcript Pull Summary"
$summaryLines += ""
$summaryLines += "- Run timestamp: $timestamp"
$summaryLines += "- Index path: $resolvedIndexPath"
$summaryLines += "- Output root: $resolvedOutputRoot"
$summaryLines += "- Stream entries considered: $($results.Count)"
$summaryLines += ""
$summaryLines += "## Status counts"
$summaryLines += ""
foreach ($group in $statusGroups) {
    $summaryLines += "- $($group.Name): $($group.Count)"
}

$summaryLines += ""
$summaryLines += "## No transcript available"
$summaryLines += ""
if ($noTranscript.Count -eq 0) {
    $summaryLines += "- None"
}
else {
    foreach ($item in $noTranscript) {
        $summaryLines += "- `$($item.Slug)` ($($item.VideoId)) - $($item.Message)"
    }
}

$summaryLines += ""
$summaryLines += "## Blocked by YouTube / retry later"
$summaryLines += ""
if ($blocked.Count -eq 0) {
    $summaryLines += "- None"
}
else {
    foreach ($item in $blocked) {
        $summaryLines += "- `$($item.Slug)` ($($item.VideoId)) - $($item.Message)"
    }
}

$summaryLines += ""
$summaryLines += "## Timed out"
$summaryLines += ""
if ($timedOut.Count -eq 0) {
    $summaryLines += "- None"
}
else {
    foreach ($item in $timedOut) {
        $summaryLines += "- `$($item.Slug)` ($($item.VideoId)) - $($item.Message)"
    }
}

$summaryLines += ""
$summaryLines += "## Other failures"
$summaryLines += ""
if ($failed.Count -eq 0) {
    $summaryLines += "- None"
}
else {
    foreach ($item in $failed) {
        $summaryLines += "- `$($item.Slug)` ($($item.VideoId)) - $($item.Message)"
    }
}

$summaryLines | Set-Content -LiteralPath $summaryPath -Encoding UTF8

$results | Format-Table -AutoSize

Write-Host ""
Write-Host "Summary written to: $summaryPath"
Write-Host ""
Write-Host "Status counts:"
foreach ($group in $statusGroups) {
    Write-Host ("  {0}: {1}" -f $group.Name, $group.Count)
}

if ($noTranscript.Count -gt 0) {
    Write-Host ""
    Write-Host "No transcript available:"
    foreach ($item in $noTranscript) {
        Write-Host ("  {0}" -f $item.Slug)
    }
}

if ($blocked.Count -gt 0) {
    Write-Host ""
    Write-Host "Blocked by YouTube / retry later:"
    foreach ($item in $blocked) {
        Write-Host ("  {0}" -f $item.Slug)
    }
}

if ($timedOut.Count -gt 0) {
    Write-Host ""
    Write-Host "Timed out:"
    foreach ($item in $timedOut) {
        Write-Host ("  {0}" -f $item.Slug)
    }
}
