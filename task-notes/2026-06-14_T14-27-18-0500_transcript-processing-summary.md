# Transcript Processing Session Summary

Timestamp: 2026-06-14T14:27:18-05:00

Purpose: concise handoff notes for a new AI session with reduced context load.

## Current Repository Shape

This repository is a transcript and curated Q&A reference archive, not an application.

Important paths:

- `src/live-stream-list.md`: livestream index with episode titles, YouTube URLs, and slugs.
- `src/transcripts/json/`: raw YouTube transcript JSON exports and source of record.
- `src/transcripts/txt/`: generated working transcript text files.
- `src/transcripts/tsv/`: optional generated TSV output when structured columns are useful.
- `docs/questions/`: curated Q&A Markdown pages.
- `docs/index.html`: GitHub Pages search page.
- `scripts/Convert-TranscriptJson.ps1`: PowerShell 7 JSON-to-TXT/TSV converter.
- `task-notes/`: transient notes and AI session summaries.

`AGENTS.md` was updated to reflect the current layout and notes convention. The backlog note now says curated Markdown pages are still needed for episodes 14 through 207.

## Notes Convention

AI session summaries should be placed under `task-notes/`.

Filename format:

```text
<summary-name>_yyyy-MM-dd_THH-mm-ss<UTC-offset>.md
```

Example:

```text
episode-14-summary_2026-06-14_T05-29-19-0500.md
```

The file header should include a full ISO 8601 timestamp with colons:

```text
Timestamp: 2026-06-14T05:29:19-05:00
```

## Converter Script

`scripts/Convert-TranscriptJson.ps1` was created and documented with PowerShell comment-based help.

Default usage:

```powershell
pwsh -NoProfile -File scripts/Convert-TranscriptJson.ps1 src/transcripts/json/14-fourteen-pieces-of-osiris.json
```

Behavior:

- Default format is TXT.
- Default output path is `src/transcripts/txt/<slug>.txt`.
- `-Format Tsv` writes TSV under `src/transcripts/tsv/`.
- Existing generated output is overwritten by default.
- `-NoClobber` fails if the output already exists.
- `-VideoUrl` can override or provide the YouTube video ID source for generated links.

TXT output format:

```text
[22] 3:58    okay um how prevalent were the gnostics in egypt
```

The actual separator between timestamp and text is a tab.

## Transcript Generation Status

A parallel conversion run was performed with parallelism of 4 over all JSON transcript files, excluding only empty JSON placeholders for episodes 118 and 162. Episodes 12 through 15 were intentionally included and regenerated.

Result:

- 206 non-empty JSON files were attempted.
- 197 TXT files exist under `src/transcripts/txt/`.
- Episodes 12, 13, 14, and 15 were regenerated successfully.

Known empty JSON placeholders:

- `src/transcripts/json/118-yeah-even-with-good-questions-the-egyptian-afterlife-still-sucks.json`
- `src/transcripts/json/162-king-for-a-day.json`

Known converter failures from the full sweep:

- `1-the-debug-episode.json`
- `2-bugs-bugs-and-fixes.json`
- `3-thrice-the-bugs-thrice-the-charm.json`
- `24-the-24-thrones.json`
- `49-counting-the-omer.json`
- `50-terminator-edition.json`
- `51-manna-machines-over-area-51.json`
- `52-one-year-streaming-we-cant-believe-it-either.json`
- `53-harmony-and-discord.json`

Failure reason: these JSON files contain items where `transcriptSegmentRenderer` is missing. The converter currently handles the main YouTube transcript shape but should be hardened for this alternate shape before those nine episodes can be generated.

## Curated Q&A Status

Curated question pages currently exist for episodes 1 through 13 and a super-chat-focused page for episode 208.

Recent curated pages added in this session:

- `docs/questions/12-the-quorum-of-the-twelve-questions.md`
- `docs/questions/13-triskaidekaphobia-questions.md`

Earlier untracked pages visible in the worktree:

- `docs/questions/10-a-tenth-portion-questions.md`
- `docs/questions/11-questions-at-the-eleventh-hour-questions.md`

For future "next two episodes" requests, follow `AGENTS.md`: start with episodes 14 and 15 unless those pages have since been created.

## Important Validation Commands

Check current dirty worktree:

```powershell
git -c safe.directory=C:/Workspaces/ancient-egypt-and-the-bible status --short
```

Search transcript and curated files:

```powershell
rg "search term" src/transcripts docs/questions
```

Validate generated TXT count:

```powershell
Get-ChildItem src/transcripts/txt/*.txt | Measure-Object
```

Validate curated page timestamp anchors:

```powershell
Select-String -Path docs/questions/FILE.md -Pattern 'target="_blank"'
rg -n "\[Watch on YouTube\]|\[PLACEHOLDER\]" docs/questions/FILE.md
```

## Current Worktree Notes

The worktree is intentionally dirty. Do not revert unrelated changes.

Known dirty or newly added areas from this session include:

- `AGENTS.md` updates for current layout and notes convention.
- `.gitignore` modified before this summary task.
- Many generated `src/transcripts/txt/*.txt` files from the conversion sweep.
- `scripts/Convert-TranscriptJson.ps1` created and updated.
- This `task-notes/` summary file.

Before committing, review exact status and decide whether generated TXT files should be committed as repository artifacts.
