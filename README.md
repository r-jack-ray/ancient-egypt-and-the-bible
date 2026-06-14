# Ancient Egypt and the Bible Transcript Reference

This repository is a public reference project for the *Ancient Egypt and the Bible* livestream archive. Its goal is to turn livestream transcripts into material that is easy to browse, search, quote, and verify from the original videos.

The raw transcript exports are useful, but long livestreams are hard to navigate from transcript text alone. This project keeps the raw data, generates working transcript text files for processing, and adds curated Markdown Q&A pages so readers can jump from a topic or question directly to the matching moment in the video.

## Start Here

- [GitHub Pages search page](docs/index.html) - browser page for searching the public reference content.
- [Livestream archive](src/live-stream-list.md) - episode list with YouTube links and transcript slugs.
- [Episode 1: The Debug Episode](docs/questions/1-the-debug-episode-questions.md)
- [Episode 2: Bugs, Bugs, and Fixes](docs/questions/2-bugs-bugs-and-fixes-questions.md)
- [Episode 3: Thrice the Bugs, Thrice the Charm](docs/questions/3-thrice-the-bugs-thrice-the-charm-questions.md)
- [Episode 4: The More Bugs Stomped, the More Appear](docs/questions/4-the-more-bugs-stomped-the-more-appear-questions.md)
- [Episode 5: Five and Even More Questions](docs/questions/5-five-and-even-more-questions.md)
- [Episode 6: All of This Has Happened Before](docs/questions/6-all-of-this-has-happened-before-questions.md)
- [Episode 7: Seven and the Ragged Tiger](docs/questions/7-seven-and-the-ragged-tiger-questions.md)
- [Episode 8: Questions Behind the Eight Ball](docs/questions/8-questions-behind-the-eight-ball-questions.md)
- [Episode 9: The Nine Bows](docs/questions/9-the-nine-bows-questions.md)
- [Episode 10: A Tenth Portion](docs/questions/10-a-tenth-portion-questions.md)
- [Episode 11: Questions at the Eleventh Hour](docs/questions/11-questions-at-the-eleventh-hour-questions.md)
- [Episode 12: The Quorum of the Twelve](docs/questions/12-the-quorum-of-the-twelve-questions.md)
- [Episode 13: Triskaidekaphobia](docs/questions/13-triskaidekaphobia-questions.md)
- [Episode 208: Super Chat Questions](docs/questions/208-super-chat-questions.md) - example of a curated question-and-answer reference page with timestamp links.

## Repository Layout

```text
docs/
  index.html                  GitHub Pages search page
  questions/                  Public curated Markdown Q&A reference pages
scripts/
  Convert-TranscriptJson.ps1  PowerShell 7 converter from JSON to TXT or TSV
src/
  live-stream-list.md         Episode index with YouTube links and transcript slugs
  live-stream-list.txt        Plain text episode index
  transcripts/
    json/                     Raw YouTube transcript JSON exports
    txt/                      Generated working transcript text files
    tsv/                      Optional generated TSV files, created on demand
```

## File Types

`src/transcripts/json/` contains raw YouTube transcript exports. Treat these as the source of record when rebuilding or auditing transcript-derived files.

`src/transcripts/txt/` contains generated working transcripts. Each line has a segment index, display timestamp, and transcript text. These files are optimized for fast `rg`, `Select-String`, and Codex-assisted review.

`src/transcripts/tsv/` is optional generated output for structured processing. TSV rows include columns such as `Timestamp`, `StartSeconds`, `Text`, and `Link`.

`docs/questions/` contains human-edited reference pages. These are meant to be read directly on GitHub Pages and GitHub and may include cleaned-up questions, short answer summaries, and timestamp links.

## Transcript Conversion

Use PowerShell 7 to generate TXT working transcripts from JSON exports:

```powershell
pwsh -NoProfile -File scripts/Convert-TranscriptJson.ps1 src/transcripts/json/14-fourteen-pieces-of-osiris.json
```

By default, the script writes to `src/transcripts/txt/` and overwrites generated output so repeated processing is simple. Use `-NoClobber` if you want the script to fail when an output file already exists.

For structured processing, generate TSV instead:

```powershell
pwsh -NoProfile -File scripts/Convert-TranscriptJson.ps1 src/transcripts/json/14-fourteen-pieces-of-osiris.json -Format Tsv
```

The script can also process multiple files from the pipeline:

```powershell
Get-ChildItem src/transcripts/json/14-*.json,src/transcripts/json/15-*.json |
    pwsh -NoProfile -File scripts/Convert-TranscriptJson.ps1
```

## How to Use This Reference

Use GitHub search to find a topic, Bible passage, person, place, or episode number. For broad searching, generated TXT transcripts are usually the fastest to scan. For cleaner browsing, use the curated Markdown pages when available.

Timestamp links point to the relevant place in the YouTube video. Curated Markdown pages may use HTML links with `target="_blank"` so GitHub opens the video in a new tab.

## Current Status

The archive contains raw JSON transcript data for many livestreams through episode 208. Curated Markdown pages currently cover episodes 1-13, plus a super-chat-focused page for episode 208. Generated TXT working transcripts currently exist for episodes 12, 14, and 15.

Curated pages should be treated as reference aids, not full replacements for the original video or transcript.

Known transcript gaps:

- Episode 118 has an empty JSON placeholder: [118-yeah-even-with-good-questions-the-egyptian-afterlife-still-sucks.json](src/transcripts/json/118-yeah-even-with-good-questions-the-egyptian-afterlife-still-sucks.json)
- Episode 162 has an empty JSON placeholder: [162-king-for-a-day.json](src/transcripts/json/162-king-for-a-day.json)
- Episode 209 and newer still need transcript pulls.

## Contributing Notes

When converting transcripts:

- Keep raw YouTube JSON exports under `src/transcripts/json/`.
- Generate TXT working files with `scripts/Convert-TranscriptJson.ps1` when a matching TXT file is missing.
- Use TSV output only when structured columns are needed for a processing task.
- Do not hand-edit generated TXT or TSV files unless the goal is explicitly to repair generated output.

When adding or improving a curated page:

- Keep the episode number and title clear at the top.
- Prefer tables for question lists, topic indexes, and timestamp references.
- Link timestamps directly to YouTube with the `?t=` parameter.
- Use short, factual answer summaries when the transcript supports them.
- Preserve uncertainty when the transcript is unclear.
- Do not silently invent answers that are not present in the source transcript.

For GitHub-friendly timestamp links that open in a new tab, use:

```html
<a href="https://youtu.be/VIDEO_ID?t=123" target="_blank" rel="noopener noreferrer">2:03</a>
```

## Scope

This project is a navigation and reference layer over public video transcripts. It is intended to help viewers, students, and researchers find where topics are discussed, then verify context in the original video.
