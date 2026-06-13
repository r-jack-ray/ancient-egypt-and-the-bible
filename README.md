# Ancient Egypt and the Bible Transcript Reference

This repository is a public reference project for the *Ancient Egypt and the Bible* livestream archive. Its goal is to turn livestream transcripts into material that is easy to browse, search, quote, and use from GitHub.

The raw transcripts are useful, but long livestreams are hard to navigate from transcript text alone. This project organizes the source material into timestamped files and curated Markdown pages so viewers can jump from a topic or question directly to the matching moment in the video.

## Search
Use the project search page:
https://r-jack-ray.github.io/ancient-egypt-and-the-bible/

## Start Here

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
- [Episode 208: Super Chat Questions](docs/questions/208-super-chat-questions.md) - example of a curated question-and-answer reference page with timestamp links.

## Repository Layout

```text
docs/
  index.html                  GitHub Pages search page
  questions/                  Public curated Markdown Q&A reference pages
src/
  live-stream-list.md         Episode index with YouTube links and transcript slugs
  live-stream-list.txt        Plain text episode index
  transcripts/                Raw transcript source data
```

## File Types

`src/transcripts/` contains raw transcript data preserved from the transcript source. These files are best for reprocessing, rebuilding exports, or auditing source text.

`docs/questions/` contains human-edited reference pages. These are meant to be read directly on GitHub Pages and GitHub and may include cleaned-up questions, short answer summaries, and timestamp links.

## How to Use This Reference

Use GitHub search to find a topic, Bible passage, person, place, or episode number. For broad searching, the TSV files usually give the widest coverage. For cleaner browsing, use the Markdown files when available.

Timestamp links point to the relevant place in the YouTube video. Curated Markdown pages may use HTML links with `target="_blank"` so GitHub opens the video in a new tab.

## Current Status

The archive contains raw transcript data for many livestreams, with curated Markdown pages being added incrementally. Curated pages should be treated as reference aids, not full replacements for the original video or transcript.

## Contributing Notes

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
