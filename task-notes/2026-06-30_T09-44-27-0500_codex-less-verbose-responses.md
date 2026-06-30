Timestamp: 2026-06-30T09:44:27-05:00

# Codex Task Note: Make Codex Responses Less Verbose

## Goal

Update Codex instructions so user-facing responses are shorter, more direct, and easier to scan.

## Recommended Location

Put durable response-style instructions in the root project file:

```text
AGENTS.md
```

Codex should treat this as the default communication style for future project tasks.

## Suggested AGENTS.md Section

Add or update a section like this:

```md
## User Communication

Keep responses brief. The user prefers direct progress reports and actionable summaries.

Default response format after work:
- Changed:
- Files:
- Checked:
- Notes:

Do not include lengthy explanations, tutorials, broad background, or repeated restatements of the prompt unless explicitly requested.
```

## One-Off Prompt Reminder

For a single Codex task, add this to the task prompt:

```text
Be concise in your response. Do not give a long explanation.

After completing the task, report only:
1. files changed
2. what changed
3. checks/tests run
4. any issues
```

## Practical Guidance

Use `AGENTS.md` for the long-term default behavior.

Use one-off prompt reminders when a specific task needs extra brevity or when Codex starts producing overly long summaries.

## Expected Codex Output Style

```text
Changed:
Files:
Checked:
Notes:
```
