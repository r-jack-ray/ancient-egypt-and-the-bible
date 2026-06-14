# Get-YouTubeTranscriptJson.ps1

Downloads YouTube transcript JSON files into the repository transcript store.

## Purpose

This script pulls transcript data directly from YouTube using the Python package `youtube-transcript-api` and stores the results under:

```text
src/transcripts/json/
```

The script's responsibility ends at transcript acquisition.

Subsequent processing steps (JSON → TXT, TSV, Markdown, indexing, cleanup, etc.) are handled by other project tooling and are intentionally outside the scope of this script.

---

## Dependency

Install the Python dependency:

```powershell
python -m pip install --upgrade youtube-transcript-api
```

Current tested version:

```text
youtube-transcript-api 1.2.4
```

---

## Default Behavior

When run without filters, the script processes **all stream entries** found in:

```text
src/live-stream-list.md
```

This includes:

* Numbered livestreams
* Special livestreams
* Other stream entries listed in the index

The script is not limited to numbered episodes.

---

## MissingOnly Behavior

```powershell
.\Get-YouTubeTranscriptJson.ps1 -MissingOnly
```

The script:

1. Reads `src/live-stream-list.md`
2. Determines the expected JSON file name
3. Checks for an existing JSON file
4. Skips existing non-empty files
5. Attempts transcript retrieval only for missing or empty files

This prevents unnecessary requests to YouTube.

An empty JSON file is treated as missing and will be retried.

---

## Progress Reporting

The script reports progress while running.

Example:

```text
Checking 209-one-meaning-flippancy (H6CBCG9YX4U)
  pulling transcript; timeout=45s
  pulled: 4941 segments

Checking 118-yeah-even-with-good-questions-the-egyptian-afterlife-still-sucks (JwbrXBi_ieU)
  pulling transcript; timeout=45s
  NoTranscript: Subtitles are disabled for this video
```

This makes it clear that the script is still working and identifies where a failure occurs.

---

## Timeout Protection

Each transcript retrieval runs with a timeout.

Default:

```powershell
-TimeoutSeconds 45
```

If a transcript request hangs or YouTube stops responding, the script records:

```text
TimedOut
```

and continues processing the remaining entries.

Example:

```powershell
.\Get-YouTubeTranscriptJson.ps1 -MissingOnly -TimeoutSeconds 45
```

---

## Common Usage

Pull all missing transcripts:

```powershell
.\Get-YouTubeTranscriptJson.ps1 -MissingOnly
```

Pull all missing transcripts with a delay between requests:

```powershell
.\Get-YouTubeTranscriptJson.ps1 -MissingOnly -DelaySeconds 3
```

Pull a specific numbered livestream:

```powershell
.\Get-YouTubeTranscriptJson.ps1 -Episode 209
```

Pull a specific stream by slug:

```powershell
.\Get-YouTubeTranscriptJson.ps1 -Slug 209-one-meaning-flippancy
```

Preview matches without downloading:

```powershell
.\Get-YouTubeTranscriptJson.ps1 -Episode 209 -ListOnly
```

---

## Output Formats

### Default Format

The script writes a panel-like JSON structure compatible with the repository's existing transcript conversion tools.

This is not a byte-for-byte export of YouTube's internal transcript panel JSON.

### Raw API Format

To save the direct `youtube-transcript-api` output:

```powershell
.\Get-YouTubeTranscriptJson.ps1 -RawApiFormat
```

---

## Status Values

### Pulled

Transcript successfully downloaded.

### Skipped

Transcript JSON already exists and was skipped.

### NoTranscript

YouTube reports that transcripts/captions are unavailable or disabled.

Examples currently known:

```text
118-yeah-even-with-good-questions-the-egyptian-afterlife-still-sucks
162-king-for-a-day
```

### Blocked

YouTube temporarily blocked transcript retrieval.

Retry later.

### TimedOut

The transcript request exceeded the configured timeout.

Retry later.

### Failed

Unexpected error requiring investigation.

---

## Run Summary Files

Each execution writes a timestamped summary file beside the script:

```text
scripts/Get-YouTubeTranscriptJson.run-summary.YYYYMMDD-HHMMSS.md
```

The summary includes:

* Status counts
* Missing transcript entries
* Blocked entries
* Timed out entries
* Other failures

These files provide a historical record of transcript acquisition runs.

---

## Recommended Bulk Pull Command

```powershell
.\Get-YouTubeTranscriptJson.ps1 `
    -MissingOnly `
    -DelaySeconds 3 `
    -TimeoutSeconds 45
```

This is the preferred command for filling transcript gaps while minimizing issues with YouTube rate limiting.
