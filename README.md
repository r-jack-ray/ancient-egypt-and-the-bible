# Ancient Egypt and the Bible Transcript Reference

This repository is a public reference project for the *Ancient Egypt and the Bible* livestream archive. Its goal is to turn livestream transcripts into material that is easy to browse, search, quote, and verify from the original videos.

The raw transcript exports are useful, but long livestreams are hard to navigate from transcript text alone. This project keeps the raw data, generates working transcript text files for processing, and adds curated Markdown Q&A pages so readers can jump from a topic or question directly to the matching moment in the video.

## Start Here

- [Livestream archive](src/live-stream-list.md) - episode list with YouTube links and transcript slugs.
- [Curated Q&A pages](docs/questions/) - browse the public Markdown reference pages directly.
- [GitHub Pages search](docs/index.html) - search only the curated Q&A pages under `docs/questions/`.
- [Episode 1: The Debug Episode](docs/questions/1-the-debug-episode-questions.md) - first curated page in the series.
- [Episode 208: Hysterical Context Error](docs/questions/208-hysterical-context-error-questions.md) - late-series example page.
- [Episode 265: The Pharaoh of Swing](docs/questions/265-the-pharaoh-of-swing-questions.md) - current highest-numbered curated episode page.

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
    tsv/                      Optional generated TSV files, created only when needed
```

## File Types

`src/transcripts/json/` contains raw YouTube transcript exports. Treat these as the source of record when rebuilding or auditing transcript-derived files.

`src/transcripts/txt/` contains generated working transcripts. Each line has a segment index, display timestamp, and transcript text. These files are optimized for fast `rg`, `Select-String`, and Codex-assisted review. They are the preferred working files for curating `docs/questions/` pages.

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

The script can also process multiple explicit files:

```powershell
pwsh -NoProfile -File scripts/Convert-TranscriptJson.ps1 `
    src/transcripts/json/14-fourteen-pieces-of-osiris.json `
    src/transcripts/json/15-and-other-taboo-jewish-numbers.json
```

## How to Use This Reference

Use GitHub search to find a topic, Bible passage, person, place, or episode number. For broad searching, generated TXT transcripts are usually the fastest to scan. For cleaner browsing, use the curated Markdown pages when available.

Timestamp links point to the relevant place in the YouTube video. Curated Markdown pages may use HTML links with `target="_blank"` so GitHub opens the video in a new tab.

## Current Status

The repository currently has generated TXT working transcripts for 229 episode streams. Every episode stream that has a TXT transcript on disk also now has a curated Markdown page under `docs/questions/`.

Known blocked numbered episodes remain:
- Live Stream #118: transcript disabled / empty placeholder
- Live Stream #162: transcript disabled / empty placeholder

Curated pages should be treated as reference aids, not full replacements for the original video or transcript.

## Transcripts Disabled By Creator and Cannot be processed at present.
- Live Stream #118: Yeah, Even with Good Questions, the Egyptian Afterlife Still Sucks
- Live Stream #162: King for a Day

## Contributing Notes

When converting transcripts:

- Keep raw YouTube JSON exports under `src/transcripts/json/`.
- Prefer the generated TXT files under `src/transcripts/txt/` for transcript inspection and Q&A curation.
- Generate TXT working files with `scripts/Convert-TranscriptJson.ps1` when a matching TXT file is missing and the JSON source is non-empty.
- Use TSV output only when structured columns are needed for a processing task.
- Do not hand-edit generated TXT or TSV files unless the goal is explicitly to repair generated output.

When adding or improving a curated page:

- Keep the episode number and title clear at the top.
- Use `docs/questions/<slug>-questions.md` for ordinary episode pages, unless the slug already ends in `questions`; in that case use `docs/questions/<slug>.md`.
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
