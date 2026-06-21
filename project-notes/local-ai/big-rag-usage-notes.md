# Big RAG Usage Notes

## Purpose

These notes document the local Big RAG setup used for the **Ancient Egypt and the Bible** transcript-reference project.

Installed personal fork:

```text
jray/big-rag
```

It is installed directly in LM Studio and does not require `npm run dev` or an open terminal window. Keep the original Big RAG plugin and any DEV copy disabled so only one Big RAG preprocessor is active.

## Project Paths

```text
Documents:
C:\Workspaces\ancient-egypt-and-the-bible

Vector store:
C:\Workspaces\LMStudioData\ancient-egypt-and-the-bible-rag

Local plugin source:
C:\Workspaces\lm_studio_big_rag_plugin
```

## Recommended Settings

```text
Embedding model: nomic-ai/nomic-embed-text-v1.5-GGUF
Retrieval Limit: 8
Affinity Threshold: 0.48
Chunk Size: 384
Chunk Overlap: 80 
Maximum concurrent files: 10
Parser delay: 0
OCR: Off
Skip Previously Indexed Files: On during normal use
Manual Reindex Trigger: Off except when intentionally indexing
```

### Chunk-size caveat

The setting is presented as a token count, but the current implementation chunks by words. A value of `512` therefore means roughly 512 words, not 512 model tokens.

## Exclude Patterns

```text
.git/**
.tmp/**
src/transcripts/json/**
*.png
*.jpg
*.jpeg
*.gif
*.webp
```

These prevent Git internals, temporary converter copies, raw JSON transcripts, and images from entering the text index.

## Incremental Indexing

Use this after adding or changing files.

```text
Manual Reindex Trigger: On
Skip Previously Indexed Files: On
```

Send:

```text
Start the Big RAG indexing operation. Do not analyze the repository yet.
```

A stable no-change run should resemble:

```text
Successfully indexed: 525/525
Failed: 0
Skipped (unchanged): 525
Updated existing files: 0
New files added: 0
Unique files in store: 525
All files were already up to date (skipped).
```

Turn **Manual Reindex Trigger** back off afterward.

When Codex or another process is writing Markdown files, later runs may report updates. Wait until other tools finish before performing a stability check.

## Full Rebuild

Use a full rebuild when changing embedding models, changing major chunking settings, repairing a questionable index, or intentionally discarding all old vectors.

```text
Manual Reindex Trigger: On
Skip Previously Indexed Files: Off
```

Send the same indexing prompt:

```text
Start the Big RAG indexing operation. Do not analyze the repository yet.
```

The personal fork now performs a real vector-store reset before rebuilding. A verified full rebuild of 525 files took about 12 minutes on the current system.

Afterward:

```text
Skip Previously Indexed Files: On
Manual Reindex Trigger: Off
```

Run one incremental check to confirm all files are skipped.

## Understanding the Summary

The patched plugin reports:

```text
Job started
Core indexing started
Core indexing completed
Job completed
Core indexing duration
Total job duration
Successfully indexed
Failed
Skipped
Updated existing files
New files added
Chunks in store
Unique files in store
```

- **Core indexing duration** measures `IndexManager.index()`.
- **Total job duration** includes setup, statistics, manifest synchronization, and vector-store closing.
- **Successfully indexed** includes files skipped as unchanged.
- **Unique files in store** counts normalized file paths, not unique content hashes.

## Retrieval Usage

Ask a normal question while `jray/big-rag` is enabled. The plugin embeds the query, searches the vector store, and supplies retrieved passages to the selected chat model.

Example:

```text
What did Dr. Falk say about the Hyksos, Avaris, chariots, and Semitic populations in Egypt?
```

Transcript spelling and automated-caption errors can reduce recall. Query expansion can help:

```text
Hyksos Hixos "hick sauce" hexa Avaris chariots Semitic Egypt
```

The local fork applies Nomic's required prefixes:

```text
search_document:
search_query:
```

## Diagnostics

Retrieved-passage diagnostics include:

```text
file
chunk
shard
score
text preview
```

The retrieval layer removes duplicate results before applying the result limit.

An indexing command may still retrieve passages because prompt preprocessing continues after indexing. The indexing summary is the authoritative result.

## Local Fork Fixes

The personal fork includes:

1. Nomic document and query prefixes.
2. Retrieval-result deduplication.
3. Improved passage diagnostics.
4. Indexing timestamps and duration reporting.
5. Timing output in manual reindex summaries.
6. Removal of stale entries for deleted files.
7. Replacement of old chunks when files change.
8. Path-specific chunk IDs so identical-content files do not overwrite each other.
9. File statistics based on normalized paths.
10. A true vector-store reset before full reindexing.
11. Tests covering prefixes, parsing, exclusions, timing, and vector-store reset.

```text
Branch: local/nomic-rag-fixes
Checkpoint tag: nomic-rag-fixes-v1
```

## Rebuilding and Reinstalling the Personal Plugin

From:

```text
C:\Workspaces\lm_studio_big_rag_plugin
```

Run:

```powershell
npm test
```

This compiles TypeScript and regenerates:

```text
.lmstudio\dev.js
```

For an updated installed build of the same plugin identity:

1. Increment `revision` in `manifest.json`.
2. Run `npm test`.
3. Reinstall:

```powershell
lms dev --install
```

Plugin identity:

```text
jray/big-rag
```

## Source Repository Safety

The checkout originated from another person's repository. Pushing to that repository was disabled.

```text
Fetch:
https://github.com/ari99/lm_studio_big_rag_plugin.git

Push:
DISABLED
```

Do not push the personal branch or tag to the original repository.

## Troubleshooting

### Indexing does not run

Confirm:

```text
Manual Reindex Trigger: On
```

A log line showing `Manual Reindex Trigger: OFF` means retrieval ran but indexing did not.

### Duplicate transcript results

Confirm `.tmp/**` is excluded and only the intended transcript sources are indexed.

### One file appears new every run

The old build could overwrite chunks when different files had identical contents. The personal fork fixes this with path-specific IDs.

### Counts change between tests

Check whether Codex, Git, or another tool is modifying Markdown files.

### `.big-rag-failures.json` does not exist

That file is created only when failures need recording. Its absence can be normal.

### The index must be discarded completely

Run a full rebuild with:

```text
Skip Previously Indexed Files: Off
```

The personal fork resets the shards before rebuilding.
