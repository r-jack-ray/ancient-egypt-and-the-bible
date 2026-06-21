# Notepad++ Regex: Clean Markdown Link Labels

This process changes only the visible link text inside square brackets:

```markdown
- [1-the-debug-episode-questions.md](docs/questions/1-the-debug-episode-questions.md)
```

into:

```markdown
- [1 The Debug Episode Questions](docs/questions/1-the-debug-episode-questions.md)
```

The link target inside parentheses remains unchanged.

## Notepad++ Setup

1. Open **Find and Replace** with `Ctrl+H`.
2. Set **Search Mode** to **Regular expression**.
3. Leave **`. matches newline`** unchecked.

## Step 1: Remove `.md` from the Visible Link Text

**Find:**

```regex
(\[[^\]\r\n]*?)\.md(?=\]\()
```

**Replace with:**

```text
\1
```

Run **Replace All** once.

## Step 2: Replace Dashes with Spaces Inside Square Brackets

**Find:**

```regex
(?:\G(?!\A)|\[)[^\]\r\n]*?\K-
```

**Replace with:**

```text
 
```

The replacement is one space.

Run **Replace All** once.

## Step 3: Capitalize Each Word Inside Square Brackets

**Find:**

```regex
(?:\G(?!\A)|\[)[^\]\r\n]*?\K(?<![A-Za-z'])([a-z])
```

**Replace with:**

```text
\u$1
```

Run **Replace All** once.

## Example

### Before

```markdown
- [1-the-debug-episode-questions.md](docs/questions/1-the-debug-episode-questions.md)
- [2-bugs-bugs-and-fixes-questions.md](docs/questions/2-bugs-bugs-and-fixes-questions.md)
```

### After

```markdown
- [1 The Debug Episode Questions](docs/questions/1-the-debug-episode-questions.md)
- [2 Bugs Bugs And Fixes Questions](docs/questions/2-bugs-bugs-and-fixes-questions.md)
```

## Notes

* The `\G` anchor continues matching from the end of the previous match on the same line.
* The `\K` token excludes the already-scanned text from the replacement.
* Each expression stops at `]`, so the path inside `(...)` is not changed.
* The capitalization step capitalizes every word, including short words such as `And`, `Of`, and `The`.
* The capitalization step assumes the source words are already lowercase; it does not lowercase existing uppercase letters.
  ::: 
