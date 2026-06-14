# Task Notes

Use this directory for transient in-project task notes, including AI session summaries and temporary task documentation.

Individual note files are local artifacts and are ignored by git. Commit durable project knowledge to `README.md`, `AGENTS.md`, or another stable documentation file instead.

## Filename Format

Use timestamp-first names so notes sort chronologically in file browsers while remaining searchable by task name:

```text
yyyy-MM-dd_THH-mm-ss<UTC-offset>_<summary-name>.md
```

Rules:

- Use local time.
- Include the UTC offset without a colon in the filename.
- Use an ASCII, lowercase, hyphenated summary name with no spaces.
- Keep the file extension as `.md`.

Example:

```text
2026-06-14_T05-29-19-0500_episode-14-summary.md
```

Also include the full ISO 8601 timestamp in the file header, using colons in the time and UTC offset:

```text
Timestamp: 2026-06-14T05:29:19-05:00
```
