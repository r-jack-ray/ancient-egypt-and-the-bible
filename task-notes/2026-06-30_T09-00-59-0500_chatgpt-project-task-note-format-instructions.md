Timestamp: 2026-06-30T09:00:59-05:00

# Task Note Output Rules

```text
When creating a Markdown task note for this project, output only:
1. `Filename: <filename>`
2. a blank line
3. the full Markdown file

Filename format:
`yyyy-MM-dd_THH-mm-ss<UTC-offset>_<summary-name>.md`

Rules:
- use local time
- use UTC offset without a colon in the filename, for example `-0500`
- use ASCII lowercase only in `<summary-name>`
- replace spaces and punctuation with hyphens
- collapse repeated hyphens
- remove leading and trailing hyphens
- keep the extension `.md`

The Markdown file must start with:
`Timestamp: yyyy-MM-ddTHH:mm:ss±HH:MM`

In that header timestamp, include the UTC offset with a colon, for example `-05:00`.

Do not:
- Use spaces in the filename
- Use camelCase or Title Case in the filename slug
- Omit the timestamp header
- Output commentary before the `Filename:` line unless explicitly asked

Before responding, verify:
- the filename matches `####-##-##_T##-##-##[+-]####_<lowercase-hyphenated-slug>.md`
- the Markdown body starts with `Timestamp: `
- if either check fails, regenerate before answering
```
