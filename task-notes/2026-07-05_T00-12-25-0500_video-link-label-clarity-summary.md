Timestamp: 2026-07-05T00:12:25-05:00

# Video Link Label Clarity Summary for Codex

## Context

The rendered Hugo page for episode `268-getting-it-okay` already makes YouTube access reasonably clear. The page has a top-level stream button labeled `Watch video`, and each Q&A item has a prominent timestamp badge using a two-line label such as:

```text
VIDEO
12:31
```

This is already much better than a plain timestamp link because the `VIDEO` label signals that the timestamp is an outbound video jump, not just page metadata.

## Recommended Refinement

Do not redesign the page. Make a small wording-only clarity improvement.

### Top full-stream button

Change the top-level button label from:

```text
Watch video
```

To:

```text
Watch full video
```

Reason: this distinguishes the full livestream link from the per-question timestamp links.

### Per-question timestamp badges

Consider changing the timestamp badge label from:

```text
VIDEO
12:31
```

To one of these clearer action labels:

```text
WATCH
12:31
```

or:

```text
WATCH AT
12:31
```

Preferred conceptual wording:

```text
Watch at 12:31
```

The rendered badge can stay compact, but the wording should make the action obvious: clicking the badge opens the source video at that question's timestamp.

## Intended User Funnel

The desired behavior is:

```text
Question -> short answer -> watch source video at exact timestamp
```

The site should remain a reference companion and launchpad into Dr. Falk's original YouTube streams, not a replacement for them.

## Implementation Guidance

1. Locate the Hugo template or partial that renders the episode-level YouTube button.
2. Update only the visible label to `Watch full video` unless there is a strong reason not to.
3. Locate the template/partial that renders each question timestamp badge.
4. Update the badge text from `VIDEO` to either `WATCH` or `WATCH AT`.
5. Preserve the existing link behavior, styling, layout, timestamp formatting, and filtering behavior.
6. Run the Hugo build/test script after changes.
7. Confirm the rendered page still looks compact and readable in dark mode.

## Acceptance Criteria

- The episode-level YouTube button clearly says `Watch full video`.
- Each Q&A timestamp badge uses more action-oriented wording than `VIDEO`.
- Timestamp links still open the corresponding YouTube timestamp.
- No large visual redesign is introduced.
- Existing page layout, search/filter controls, question count display, and expanded-answer toggle continue to work.
