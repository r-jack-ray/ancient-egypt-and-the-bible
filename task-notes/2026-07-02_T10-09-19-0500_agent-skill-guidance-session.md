# Agent Skill Guidance Session

Timestamp: 2026-07-02T10:09:19-05:00

## Completed Work

- Updated `transcript-to-md-reference` and `transcript-question-page-audit` to prefer direct, searchable questions and concise third-person answers.
- Removed extra accumulated project-variation noise from both transcript skills.
- Updated both skill `agents/openai.yaml` files to match the current style and purpose.
- Added `AGENTS.md` runner guidance for Python, PowerShell 7, Node/npm/pnpm, and Hugo availability.
- Added `AGENTS.md` guidance for short-form audit-agent prompts with project-root-relative paths.
- Verified important runner behavior: `pwsh` is PowerShell 7, `powershell` is Windows PowerShell 5.1, direct `hugo` is not on PATH, and `node` / `npm` / `pnpm` are currently runnable.
- Verified `npm run check:js`, `node --test`, and `pwsh -NoProfile -File scripts/Test-HugoSite.ps1 -SkipHugo`.
- Discussed prompt patterns for audit repair, wording-only cleanup, and queued audit work.

## Useful Prompt Patterns

### Full Audit And Repair

Use this when the page may be missing questions, has stale answers, or needs a real transcript-backed audit:

```text
docs/questions/<file>.md use $transcript-question-page-audit find and fix issues silently with full transcript coverage
```

This should trigger full transcript coverage and is the right pattern for completeness work.

### Faster Wording-Only Pass

Use this when the goal is only to reduce routine "He said" style answer openings:

```text
docs/questions/<file>.md use $transcript-question-page-audit wording-only pass: remove routine "He said" style openings from short and expanded answers where the meaning stays the same. Preserve row count, timestamps, questions, and transcript-supported caveats. No missing-question audit.
```

This should keep the run targeted. The key phrase is `No missing-question audit`.

### General Silent Fix

Use this when the page should be repaired but a full missing-question sweep is not necessarily required:

```text
docs/questions/<file>.md use $transcript-question-page-audit find and fix issues silently
```

## Queue Process Recommendation

The current `task-notes/file-revisions-pass-01.txt` approach is reasonable: one prompt per line, manually submit the first line, wait long enough to avoid audit-log collisions, then continue.

A better semi-automated process would be a Codex Scheduler automation that runs every fixed interval and processes exactly one line per run:

```text
In C:\Workspaces\ancient-egypt-and-the-bible, read task-notes/file-revisions-pass-01.txt.

If the file has no non-empty lines, report that the queue is empty and pause this automation.

Otherwise:
1. Take only the first non-empty line.
2. Run that line as the audit request.
3. Remove only that processed line from task-notes/file-revisions-pass-01.txt.
4. Leave remaining lines in original order.
5. Stop after one item.
```

Notes:

- The scheduler is time-based, not file-condition-based, so the empty-file stop must be part of the prompt.
- One line per run is safer than a loop inside one long-running turn because it limits audit-log collision risk and keeps each repair inspectable.
- Use local-project mode only if you are comfortable with the automation modifying the active checkout. Use a worktree if you want isolation.
- If the scheduler cannot pause itself automatically, have the prompt report "queue empty" and leave the automation paused manually afterward.

## CLI Automation Caution

The Codex manual documents `codex exec` for non-interactive scripting, but local testing in this session could not launch the packaged `codex.exe` from the sandbox. Do not build a JS or PowerShell loop around `codex exec` until it works from your normal terminal.

If testing outside Codex succeeds, the rough pattern would be:

```powershell
codex exec --sandbox workspace-write "docs/questions/<file>.md use $transcript-question-page-audit find and fix issues silently with full transcript coverage"
```

Until that is proven locally, Codex Scheduler or manual submission is safer.

## Runner Notes

- Use `pwsh -NoProfile -File ...` for repo PowerShell scripts.
- Use `node --check` and `node --test` directly when they cover the same surface as an npm wrapper.
- Use `pwsh -NoProfile -File scripts/Test-HugoSite.ps1 -SkipHugo` when local Hugo is missing.
- Allow a longer timeout for static Hugo compatibility checks; 45-70 seconds is normal here.
- Use `codex_app.load_workspace_dependencies` for Python when a helper needs Python; do not assume `python` is on PATH.

## Suggested Commit Messages From This Session

- `add agent runner guidance`
- `streamline transcript Q&A skills`
- `add audit prompt pattern guidance`

## Current Follow-Up Ideas

- Consider adding a small ignored queue-runner note under `task-notes/` that documents exactly how to operate the one-line-per-run queue.
- Consider creating a paused Codex automation only after deciding whether it should run in the active checkout or an isolated worktree.
- If you want an external script path, first test `codex exec --help` and one harmless `codex exec` command from a normal terminal outside this sandbox.
