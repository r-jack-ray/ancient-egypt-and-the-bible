# TypeScript/Node TXT-Only Transcript Pipeline Migration Plan

Timestamp: 2026-07-25T16:43:32-05:00

Review status: Revalidated against the working tree on 2026-07-25. `HEAD`, `master`, and the locally recorded `origin/master` all resolve to the SHA below; remote freshness is deliberately deferred to the Phase 0 `git fetch`. The only current worktree change is this untracked plan note.

Implementation status: Authorized by the user on 2026-07-25 and implemented on
`codex/typescript-transcript-pipeline`. Phases 0-6 are represented by the typed
pipeline, bootstrapped control files, validation, live report-only inventory
probe, ignored TXT canary, and feature-branch delivery work. Phase 7 remains
deliberately unimplemented and requires separate post-deployment authorization.

## Decision Summary

Move transcript discovery and acquisition to a Node 22 + strict TypeScript toolchain modeled on `C:\Workspaces\naval-history-with-dr-alex`, while preserving this repository's existing public and editorial contracts:

- Implement the migration from a feature branch based on `origin/master`.
- Keep Hugo, `site/`, `docs/questions/`, and the existing GitHub Pages deployment model.
- Keep every current `src/transcripts/json/*.json` file tracked and unchanged throughout the feature branch, merge, and first successful deployment.
- Make TXT the only persisted transcript payload for all future pulls.
- Preserve the existing transcript basename and line-format contracts.
- Keep small JSON control files for inventory, metadata, manifest, and resumable status. These are indexes, not transcript payloads.
- Treat removal of `src/transcripts/json/` from Git history as a separate destructive project after the migrated pipeline is proven on `origin/master`.

This file is a plan only. It does not authorize implementation, branch creation, JSON deletion, a history rewrite, a force-push, or a deployment.

## Verified Starting State

The following baseline was verified before this plan was written:

| Surface | Current state |
| --- | --- |
| Git | `HEAD`, `master`, and the local `origin/master` tracking ref are `a620f0bfd7f0e28fd82f45fa3a8134349ee68157`; the only current worktree change is this untracked plan note |
| Remote | `origin` is `https://github.com/r-jack-ray/ancient-egypt-and-the-bible.git` |
| Stream index | 284 unique entries and slugs in `src/live-stream-list.md`: 271 numbered streams and 13 other streams |
| Stored transcripts | 282 tracked JSON files and 282 tracked TXT files with matching basenames |
| Known unavailable transcripts | `118-yeah-even-with-good-questions-the-egyptian-afterlife-still-sucks` and `162-king-for-a-day` |
| TXT byte shape | All 282 files are BOM-free, tab-formatted, and end in one newline; 281 use LF and `271-all-your-reliquaries-are-mine.txt` is a clean tracked legacy file whose working-tree bytes use CRLF |
| JSON/TXT corpus parity | All 766,759 stored TXT rows align with the corresponding JSON transcript-renderer counts, and every display timestamp matches the floored `startMs` second |
| Current payload size | Approximately 665 MiB of JSON and 46 MiB of TXT |
| Packed Git repository | Approximately 179 MiB |
| Current acquisition | PowerShell launches Python `youtube-transcript-api`, writes JSON, then a separate PowerShell converter writes TXT |
| Current Node use | MiniSearch/search tests and Hugo support only; there is no TypeScript configuration or TypeScript source |
| Current local checks | `npm test` passes 16/16 and `npm run check:js` passes; the Hugo wrapper is not accepted as authoritative until Phase 1 adds explicit native child-exit propagation |
| API key | `reports/youtube-api-key.txt` exists, is ignored through `/reports/`, and is not tracked; its contents were not read during planning |
| Deployment | `.github/workflows/pages.yml` runs from `master`, uses Node 22, builds Hugo, validates the result, and deploys `site/public` |

Important current contracts:

- `src/live-stream-list.md` supplies the stable video ID and slug mapping used by Hugo.
- Existing TXT lines use:

  ```text
  [index] timestamp<TAB>transcript text
  ```

- Existing TXT paths use:

  ```text
  src/transcripts/txt/<current-live-stream-slug>.txt
  ```

- `scripts/Build-HugoSiteContent.ps1` consumes `src/live-stream-list.md` and `docs/questions/`; it does not need transcript JSON to build the site.
- The two known unavailable streams have no JSON or TXT file and must remain honest unavailable records rather than empty fabricated transcripts.

## What To Reuse From The Naval Repository

Reuse the acquisition architecture, not the website architecture.

| Naval design | Use here | Required adaptation |
| --- | --- | --- |
| Node 22, strict TypeScript, `tsx`, compiled `node:test` tests | Yes | Keep this repository's CommonJS-compatible root |
| `googleapis` for official channel inventory and video metadata | Yes | Use the Ancient Egypt and the Bible channel and streams-only archive scope |
| `youtube-transcript-plus` with direct caption-track fallback | Yes | Render this repository's indexed, tab-separated TXT format |
| `fetch:video-links` and metadata synchronization | Yes | Preserve all existing video IDs, slugs, order, and basenames |
| Single-video and resumable batch transcript commands | Yes | Never write a raw transcript JSON payload |
| Manifest and durable failure/status tracking | Yes | Bootstrap from the 282 existing TXT files before any fetch |
| Stored-file skip, retry, force, limit, dry-run, and request pacing | Yes | Require explicit overwrite and add a block/rate-limit circuit breaker |
| `alternate:fetch:transcripts:safe` with a 60-second request delay | Yes | Document that the delay applies to each outbound transcript request |
| Astro, Pagefind, segment shards, topic tooling, and Astro deployment | No | Hugo remains the website framework |
| Root `"type": "module"` | No | It would break current CommonJS tests and the UMD search helper |
| `timestamp_title_videoId.txt` filenames | No | Existing `<live-stream-slug>.txt` identity remains stable |
| Naval `[timestamp] text` TXT renderer | No | Preserve `[index] timestamp<TAB>text` |
| Automatic exclusion of videos at or below 61 seconds | No by default | Make any duration rule an explicit project decision |
| Direct multi-file `writeFile` behavior | No | Use per-file atomic replacement, a single-writer guard, and a recoverable transaction journal; do not claim cross-file atomicity |

## Definition Of TXT-Only

TXT-only applies to transcript bodies, not to all structured project state.

Allowed tracked control files:

- `src/channel/episodes.json`
- `src/channel/video-metadata.json`
- `src/transcripts/manifest.json`
- `src/transcripts/fetch-status.json`

Allowed tracked transcript payloads:

- `src/transcripts/txt/*.txt`

Disallowed new transcript payloads:

- `src/transcripts/json/*.json`
- tracked `src/transcripts/tsv/*.tsv`
- raw caption JSON, watch-page JSON, VTT, or HTML stored outside ignored diagnostics

Any raw response needed for troubleshooting must require an explicit diagnostic flag and go under ignored `reports/`, never into the tracked transcript store.

### Deliberate information boundary

For future pulls, the tracked TXT preserves the stable segment index, floored start second as a display timestamp, and normalized caption text. The manifest may preserve transcript-level provenance such as provider, selected and available languages, manual/automatic caption kind, fetch time, segment count, first/last start seconds, optional last end second while it is still known in memory, byte length, and SHA-256.

TXT-only intentionally does **not** preserve per-segment subsecond offsets, duration/end values, target IDs, caption-track URLs, raw renderer fields, or the original watch-page/caption response. Those values may be used in memory while formatting but are discarded after a successful write. This loss must be accepted explicitly before Phase 4 because a later tool cannot reconstruct those raw fields from the TXT file. Diagnostic capture remains opt-in, ignored, secret-scrubbed, and unsuitable as a canonical source.

## Target Repository Shape

```text
.gitattributes
package.json
package-lock.json
tsconfig.json
src/
  channel/
    episodes.json
    video-metadata.json
  scripts/
    bootstrap-transcript-store.ts
    check-stream-index.ts
    check-transcript-store.ts
    fetch-transcript-batch.ts
    fetch-video-metadata.ts
    get-channel-video-links.ts
    get-video-transcript.ts
    report-transcript-problems.ts
    youtube-api-key-file.ts
  pipeline/
    atomic-write.ts
    transcript-store-lease.ts
    transaction-journal.ts
  youtube/
    batch-transcripts.ts
    channel-video-links.ts
    transcripts.ts
    video-metadata.ts
    *.test.ts
  live-stream-list.md
  transcripts/
    manifest.json
    fetch-status.json
    txt/
      <stable-existing-slug>.txt
    json/                         # retained unchanged until post-deployment history work
docs/questions/                  # unchanged canonical curated content
site/                            # unchanged Hugo framework
reports/
  youtube-api-key.txt            # ignored local secret
```

The exact module split may be adjusted during implementation, but CLI parsing, YouTube access, storage, validation, and formatting should remain separately testable.

## Control-File Authority And Schema Contracts

Do not replace one ambiguous index with four overlapping authorities:

| File | Authority | Must not own |
| --- | --- | --- |
| `src/channel/episodes.json` | Canonical archive membership, video ID, curated `displayTitle`, episode number when present, established slug, explicit display order, scope/lifecycle state, and stable `fileStem` | Volatile request timestamps, raw API responses, or stored-payload truth |
| `src/channel/video-metadata.json` | Normalized last accepted YouTube metadata snapshot keyed by video ID, including `latestApiTitle` separately from the curated title | Archive membership, established slug, or transcript stored/not-stored truth |
| `src/transcripts/manifest.json` | Successfully committed TXT payload facts: path, canonical-LF SHA-256/byte length, line/segment count, provenance, language/caption kind when known, and summarized start timing | Fetch failures, pending work, or public display order |
| `src/transcripts/fetch-status.json` | Resumable operational state and the latest attempted outcome per video ID | Canonical identity or proof that a TXT is valid |
| `src/live-stream-list.md` | Deterministic Hugo compatibility projection after cutover | Independent hand-edited identity, order, or slug changes |

Requirements:

- Give every control file an explicit `schemaVersion` and reject unknown newer versions.
- Validate parsed JSON as `unknown`; do not trust a TypeScript cast as runtime validation.
- Require unique video IDs everywhere and validate cross-file identity, membership, path, and state invariants.
- Keep archive membership/lifecycle, video readiness, and transcript acquisition availability as separate typed state machines.
- Serialize with stable record ordering, UTF-8 without BOM, and one final newline.
- Keep tracked metadata to fields required for identity comparison, stream eligibility, naming, duration/timing, and readiness. Exclude descriptions, view statistics, raw responses, and run-level counters.
- Do not rewrite canonical control files when their semantic content is unchanged. Put volatile probe timestamps and request diagnostics in `fetch-status.json` or ignored reports rather than creating no-op diffs in `episodes.json`.
- Add an explicit migration function and fixture for every future schema-version change.

## Compatibility And Safety Contracts

### Stable identity

- Key inventory, manifest, and status records by YouTube video ID.
- Bootstrap each existing `fileStem` from the current `src/live-stream-list.md` slug and matching TXT basename.
- Once stored, an existing `fileStem` always wins over a later title, date, or metadata change.
- Preserve established public titles as well as slugs unless an explicit reviewed change accepts a title update.
- Do not rename or rewrite the existing 282 TXT files during bootstrap.
- Validate 11-character YouTube IDs and a conservative portable `fileStem`/slug syntax.
- Reject exact duplicate video IDs. Reject exact and Windows case-folded duplicate slugs, paths, or `fileStem` values, plus Windows reserved names and trailing dots/spaces; YouTube video IDs remain case-sensitive.
- Resolve and validate every output path under `src/transcripts/txt/`; reject traversal, unsafe absolute paths, and symlink/junction/reparse-point escape from the owned root.

### TXT format

Newly fetched files must match the current formatter:

```text
[0] 0:01<TAB>first segment
[1] 0:08<TAB>second segment
```

Formatting requirements:

- Zero-based contiguous index.
- Display timestamp derived from the floored start second.
- `m:ss` below one hour and `h:mm:ss` at one hour or above.
- One logical transcript segment per line.
- Embedded CR/LF and tabs in caption text normalized to spaces.
- UTF-8 without a BOM.
- LF line endings for every new or explicitly refetched file.
- Exactly one final newline.
- No empty output file when fetching, parsing, or validation fails.

The legacy parser must accept both LF and CRLF (`\r?\n`) without treating `\r` as caption text. Bootstrap must accept the one known CRLF working-tree legacy file without rewriting it. Manifest `contentSha256` and `canonicalByteLength` must be computed over the BOM-free UTF-8 representation with line endings normalized to LF, so validation is stable across Windows and Linux checkouts. Record observed newline style only in the ignored baseline diagnostic, not as a manifest invariant; require all new writes to be exact LF output and add `.gitattributes` coverage for transcript TXT and canonical control files. Raw working-tree byte hashes are diagnostic only; baseline preservation is proved with Git blob IDs plus canonical hashes.

### Inventory scope

The naval fetcher crawls the uploads playlist, which is broader than this archive. The adapted fetch must:

- Use `https://www.youtube.com/@ancientegyptandthebible`.
- Resolve the expected channel ID and uploads-playlist ID in a reviewed Phase 3 live preflight, persist them only after the handle result is accepted, and make every later refresh fail on a handle/channel/playlist mismatch instead of silently switching sources.
- Fetch official uploads and normalized `videos.list` metadata.
- Preserve all 284 baseline entries even if an old item is no longer returned by the API.
- Admit new completed, scheduled, or in-progress livestreams using live-stream metadata.
- Exclude ordinary uploads and Shorts from the transcript archive unless explicitly approved.
- Mark scheduled, live, processing, missing-metadata, private, or removed entries as states; do not silently delete them.
- Report additions, omissions, title changes, slug proposals, and scope exclusions before changing the public index.
- Treat a partial, paginated probe or unknown-completeness inventory as diagnostic-only; it can never update canonical membership or order.
- Preserve the current newest-first interleaving of numbered and non-numbered streams.

### Authority transition

Use a guarded transition instead of creating two competing hand-edited indexes:

1. Parse the current `src/live-stream-list.md` into the first typed `episodes.json`.
2. Preserve its 284 identities as the migration baseline.
3. Reconcile API results into a candidate `episodes.json` by video ID without changing established titles or slugs.
4. Render a candidate `src/live-stream-list.md` and prove it is byte-equivalent before cutover.
5. After parity is accepted, treat `episodes.json` as the machine acquisition authority and keep `src/live-stream-list.md` as a deterministic, tracked Hugo compatibility output.
6. Normal refreshes may add validated new streams but must fail rather than implicitly rename or remove an established record.
7. Inventory refresh is candidate/delta-only by default. Canonical writes require an explicit `--apply` plus a complete inventory, expected channel-ID match, and explicit acceptance of each addition or established-title change.

### API key

- Invoke `npm run fetch:video-links` without a hard-coded `--api-key-file`; make the resolver internally fall back to `reports/youtube-api-key.txt` only after the explicit and environment sources below are absent.
- Do not accept a literal `--api-key` value because command-line arguments can be exposed in process listings and shell history.
- Resolution precedence should be explicit `--api-key-file`, `YOUTUBE_API_KEY`, then the default `reports/youtube-api-key.txt` when it exists.
- Trim whitespace and a possible UTF-8 BOM; reject an absent or empty configured key.
- Never print, serialize, hash into a report, commit, or pass the key in a process title.
- Convert Google/client failures to allowlisted sanitized fields; never serialize an entire error/request object that may contain headers, URLs, or auth configuration.
- Retain `/reports/` ignore coverage and add `youtube-api-key.txt` as defense in depth.
- Do not put the key or any transcript acquisition call in GitHub Actions.
- The key is for official inventory/metadata calls. Transcript caption fetching does not use it.

### Write integrity and concurrency

- Treat atomicity as a per-file guarantee. A filesystem rename cannot make TXT, manifest, and status updates one cross-file transaction.
- For every stored transcript, create a write-ahead transaction journal under ignored `.tmp/transcript-store/` containing the video ID, destination, old manifest record/hash when present, proposed new record/hash, temporary path, and phase.
- Create and advance the journal through validated, flushed, per-file atomic replacements. Persist each next journal phase before performing the state transition it authorizes, so a crash cannot leave a newer store state than the durable recovery instructions.
- Write and flush each new TXT to a unique temporary file in the destination directory, validate exact bytes, and only then replace the destination.
- Retry bounded transient Windows filesystem failures such as `EPERM` and `EBUSY`, and remove owned temporary/recovery files in `finally` after a successful commit or rollback.
- For a forced replacement, create, flush, and byte-verify a same-filesystem recovery copy of the last valid TXT before replacing the destination; retain it until the new TXT and manifest record are committed and revalidated.
- Define the manifest replacement as the transcript transaction's canonical commit point. For a new file, use validated/flushed temporary TXT -> final TXT -> manifest commit -> status update. For a replacement, use journal/recovery copy -> validated final TXT -> manifest commit -> status update -> recovery cleanup.
- Advance the journal after each per-file atomic replacement. Update `fetch-status.json` last because it is operational state, not proof of storage.
- Atomically replace inventory, metadata, manifest, status, and generated Markdown files individually.
- Checkpoint `fetch-status.json` after every attempted video.
- Add one bounded canonical-pipeline writer lease with owner, PID, token, and renewal time. It must cover inventory, projected Markdown, metadata, manifest, status, and TXT writes—not only transcript fetching. Never steal it on age alone; stale recovery must verify that the recorded process is absent or require an explicit recovery action.
- On startup, refuse new writes while an unfinished journal exists. `check:transcript-store --repair-transaction` must recover transcript transactions, and `check:stream-index --repair-transaction` must recover accepted inventory/index transactions; each then validates its full owned surface.
- Preserve or recover the last valid TXT and manifest after interruption; status may lag and must be reconstructible from the committed store plus journal.
- Add reconciliation that detects orphan TXT files, missing TXT files, hash/byte/line mismatches, stale temp/recovery files, manifest drift, and unfinished transactions.
- Never delete an obsolete or superseded TXT path unless it is under the owned transcript root and the replacement has been committed successfully.

## Proposed NPM Command Contract

The final names should preserve the familiar naval workflow:

| Command | Purpose |
| --- | --- |
| `npm run clean` | Remove only generated `dist/` output with a cross-platform Node command |
| `npm run build` | Compile new TypeScript tooling to `dist/` |
| `npm run check:types` | Run `tsc --noEmit` |
| `npm run test:legacy` | Run only `tests/**/*.test.js`, not bare auto-discovery that can also find `dist/` |
| `npm run test:typescript` | Clean, compile, and run only `dist/**/*.test.js` |
| `npm test` | Run both legacy and TypeScript test suites |
| `npm run check:functional` | Run the ordered, network-free functional validation sequence without Git worktree-cleanliness assertions; use it inside `check:offline` and in disposable JSON-free proof copies |
| `npm run check:offline` | Run the ordered, network-free PR/Pages validation sequence used by CI |
| `npm run bootstrap:transcript-store` | One-time fail-closed bootstrap of episodes, manifest, and status from the reviewed legacy index/TXT store |
| `npm run check:stream-index` | Prove `src/live-stream-list.md` exactly matches the deterministic `episodes.json` projection; `--repair-transaction` recovers an interrupted accepted apply |
| `npm run check:transcript-store` | Validate inventory, manifest, status, filenames, hashes/line shape, and TXT coverage without network access |
| `npm run fetch:video-links` | Fetch official inventory and write an ignored candidate/delta report; canonical files remain unchanged unless guarded `--apply` acceptance is supplied |
| `npm run fetch:video-metadata` | Resume or force normalized metadata refresh |
| `npm run alternate:fetch:transcript -- --video-id <id>` | Fetch one registered episode directly to the TXT store; unregistered canaries require an explicit ignored output root |
| `npm run alternate:fetch:transcripts` | Sequential resumable batch fetch |
| `npm run alternate:fetch:transcripts:safe` | Batch fetch with `--request-delay-ms 60000` |
| `npm run alternate:fetch:transcripts:retry` | Retry only recorded retryable failures; do not imply overwrite |
| `npm run alternate:fetch:transcripts:retry:safe` | Retry only recorded retryable failures with the 60-second request delay; `--force` remains a separate explicit option |
| `npm run report:transcript-problems` | Build an ignored human-readable report from saved status without contacting YouTube |

Retain all existing Hugo/search commands. Do not copy any Astro or Pagefind scripts.

Transcript-fetch CLI semantics:

- `--dry-run` performs no network requests and no canonical writes. It may print a plan or write an explicitly requested ignored report.
- `--limit` counts outbound transcript attempts, not stored skips or deferred items.
- `--retry-failed` selects recorded retryable failures only; an empty selection is a strict no-request, no-write success.
- `--force` is the only option that permits replacement of a valid stored TXT, must be paired with one explicit video ID or reviewed allowlist plus the expected current canonical hash, and must never be embedded in a retry convenience script. Preview a segment/timestamp/content-hash diff before commit. An unscoped batch-global force is unsupported.
- Document stable process outcomes: exit `0` for success/clean no-op, `2` for a completed batch with item failures, `3` for a rate-limit/block circuit break, `4` for schema/store/transaction corruption or lock failure, and `5` for usage/configuration errors. Tests must cover each outcome.

Inventory `--apply` must name or consume an accepted delta; it cannot silently accept every candidate addition or title change. Metadata-refresh `--force` means bypassing metadata freshness/defer timing and never authorizes transcript replacement.

## TypeScript And Package Configuration

The naval repository is root ESM, but this repository is not ready for that unrelated conversion:

- `tests/*.test.js` uses `require`.
- `site/assets/js/search-core.js` is UMD/CommonJS when loaded by Node.
- `scripts/Build-SearchIndex.mjs` intentionally uses `createRequire` to load that UMD `.js` file.
- Hugo serves the current browser scripts as classic scripts.

Use this lower-risk setup:

- Add `"engines": { "node": ">=22" }`.
- Make the current package semantics explicit with `"type": "commonjs"`.
- Keep existing `.js` and `.mjs` files unchanged.
- Add strict `tsconfig.json` settings based on the naval project:
  - `target: ES2022`
  - `lib: ["ES2022"]`
  - `module: NodeNext`
  - `moduleResolution: NodeNext`
  - `rootDir: src`
  - `outDir: dist`
  - Node types
  - `strict`
  - `noUncheckedIndexedAccess`
  - `exactOptionalPropertyTypes`
  - `isolatedModules`
  - `noEmitOnError`
  - `forceConsistentCasingInFileNames`
  - `esModuleInterop: true`, with a compiled CommonJS runtime test for any default imports retained from the naval code
  - `resolveJsonModule: true`
  - `skipLibCheck: true`
  - `sourceMap`
- Include `src/**/*.ts`; exclude `dist` and `node_modules`.
- Omit declaration output unless a concrete local consumer requires it.
- Omit naval's `verbatimModuleSyntax: true`; new TypeScript should compile to CommonJS in this package scope.
- Use `.js` suffixes in relative TypeScript imports so compiled NodeNext output resolves consistently.
- Run source CLIs through `tsx`; clean/compile and run tests from `dist/` with `node:test`. Do not make a successful `tsx` run substitute for `tsc --noEmit`, and smoke-test each important CLI's `--help` through both `tsx` and compiled `node dist/...` execution.
- Add `/dist/` to `.gitignore`.
- Add `typescript`, `tsx`, and `@types/node` as development dependencies.
- Add `googleapis` and `youtube-transcript-plus` as runtime dependencies.

The reviewed naval installation currently uses `googleapis` 173.0.0 and `youtube-transcript-plus` 2.0.0; the latter publishes distinct `import` and `require` exports. Revalidate the selected versions' Node 22 support, CommonJS interop, licenses, and types during Phase 1, then lock them through `package-lock.json`. A root ESM conversion is not required. Any later root ESM migration should be a separate change with explicit tests and browser-asset review.

## Implementation Phases

### Phase 0: Create The Feature Branch And Freeze A Baseline

Create the implementation branch only after updating remote state:

```powershell
git fetch --prune origin
git rev-parse origin/master
```

Compare `origin/master` with the reviewed SHA `a620f0bfd7f0e28fd82f45fa3a8134349ee68157`. If it moved, stop and revalidate the repository counts, contracts, affected files, and this plan against the new base rather than treating the old baseline as current. Only after that gate passes:

```powershell
git switch -c codex/typescript-transcript-pipeline origin/master
git status --short
```

Preserve this reviewed plan as the only expected starting worktree change and commit it on the feature branch before implementation, unless it was committed separately first.

Record an ignored baseline report under `reports/` containing:

- Starting `origin/master` commit SHA.
- 284 inventory records, 282 JSON files, 282 TXT files, and the two unavailable slugs.
- Git blob ID, canonical-LF SHA-256, canonical byte length, observed working-tree newline style, line count, first timestamp, and last timestamp for every TXT.
- The Git tree object for `src/transcripts/json/`.
- Existing `npm test`, `npm run check:js`, and Hugo static-check results.
- Current branch/ref inventory.
- A full TXT-format check proving contiguous zero-based indexes, timestamp/tab shape, UTF-8 without BOM, and exactly one final newline.

Exit gate:

- Branch begins at the reviewed `origin/master`.
- This reviewed plan is tracked, and the worktree has no unrelated changes.
- The baseline report is reproducible.
- The deliberate loss of per-segment raw timing/renderer fields in future pulls has been accepted.
- No source file has changed yet.

### Phase 1: Add The TypeScript Foundation Without Changing Hugo

Actions:

1. Update `package.json` and `package-lock.json`.
2. Add the CommonJS-compatible strict `tsconfig.json`.
3. Add `.gitattributes` rules that make new transcript TXT and canonical control files use LF without rewriting the existing transcript blobs.
4. Add `/dist/` and defense-in-depth key/ignored-diagnostic rules.
5. Do **not** ignore `src/transcripts/json/` during Phases 0-6: its tracked legacy files remain visible, and any accidental new payload there must be obvious in `git status` and rejected by validation.
6. Separate legacy JS tests from compiled TS tests with explicit source/output globs.
7. Add fixture-only tests for helpers, CommonJS dependency/runtime interop, and compiled Node built-in imports before live YouTube work.
8. Harden existing native-command gates before treating them as evidence:
   - `scripts/Test-HugoSite.ps1` must check the exit code after both child `pwsh` calls.
   - `scripts/Build-HugoSiteContent.ps1` must check the exit code after `Build-SearchIndex.mjs`.
   - Add a negative test proving each wrapper fails when its child process fails.

Exit gate:

- Existing search tests still pass.
- New compiled TypeScript tests run visible assertions.
- Selected dependency versions load successfully from compiled CommonJS output on Node 22.
- `npm run check:types` passes.
- `npm run check:js` passes.
- `pwsh -NoProfile -File scripts/Test-HugoSite.ps1 -SkipHugo` passes.
- Deliberately failing child-process fixtures make the two PowerShell wrappers exit nonzero.
- No Hugo source, layout, configuration, or output-framework change is present.

### Phase 2: Bootstrap Inventory And Manifest Identity

Build a one-time bootstrap command that reads:

- `src/live-stream-list.md`
- `src/transcripts/txt/*.txt`

It should write or propose:

- `src/channel/episodes.json`
- `src/transcripts/manifest.json`
- `src/transcripts/fetch-status.json`

Bootstrap rules:

- Create 284 inventory records keyed by video ID.
- Create 282 stored manifest records using the existing TXT basename as `fileStem`.
- Record source as a legacy migration/import, without claiming a new YouTube fetch occurred.
- Derive canonical-LF SHA-256, canonical byte length, line count/segment count, `firstStartSeconds`, and `lastStartSeconds` from TXT; keep observed checkout newline style only in the ignored baseline report.
- Set legacy-import language/caption kind to explicit `unknown` unless an optional parity read proves them; never synthesize `lastEndSeconds` from TXT. That field is optional and only available for newly fetched records while raw timing remains in memory.
- Record episodes 118 and 162 as `known_unavailable` only in the authoritative episode lifecycle state, not as stored manifest records or invented fetch attempts. Label that state as a legacy observation and derive any status/report view from it until a real fetch attempt exists.
- Do not rewrite a TXT byte.
- Accept the recorded CRLF legacy file during bootstrap but reject any newly introduced CRLF transcript.
- Do not read JSON to establish ongoing identity; JSON may be used only for optional migration parity checks.
- Fail on any list, filename, path, line-format, or duplicate mismatch.

Exit gate:

- 284 unique inventory records.
- 282 manifest records whose TXT files exist and match their canonical hash/byte/line metadata.
- Two explicit unavailable episode records, no fabricated fetch attempts, and no fabricated manifest entries for them.
- All original Git blob IDs and canonical TXT hashes are unchanged.
- All existing JSON files and their Git tree are unchanged.
- A second bootstrap/check run is a byte-for-byte no-op; compare-before-write logic must not churn `updatedAt` fields.

### Phase 3: Implement `fetch:video-links` And Metadata Reconciliation

Port and adapt the naval official-API layers:

- Key-file loader.
- Channel/playlist resolution.
- 50-item uploads-playlist paging.
- Batched `videos.list` metadata.
- Request delay and checkpoint support.
- Typed inventory and metadata schemas.

Project-specific behavior:

- In the first live preflight, resolve the handle to a channel ID and uploads-playlist ID, display all values for review, and persist the accepted IDs. Later runs must use and verify those pinned IDs.
- Filter candidate additions to livestreams.
- Keep scheduled and in-progress streams in inventory but defer transcript fetches.
- Merge by video ID.
- Preserve every established title, slug, and `fileStem`.
- Never prune an unseen legacy item automatically.
- Default to an ignored candidate/delta report for additions, API omissions, title changes, eligibility, and proposed new slugs; make no canonical writes.
- Permit `--apply` only for a complete, pinned-channel inventory and an explicitly accepted delta/addition set.
- Use deterministic collision-safe slugging for genuinely new streams.
- Render the Hugo Markdown index through a tested compatibility writer.
- Make probe options write only under `reports/`; probe runs must never overwrite canonical control files.
- Optionally run the legacy `/streams`-tab scraper to an ignored report as an independent ordering/scope comparison; never let it write the canonical index after cutover.
- Log only request labels, method/host, counts, and safe IDs. Never log the API key, cookies, headers, full signed caption URLs, or raw response bodies.
- Apply `episodes.json` and its `src/live-stream-list.md` projection through a separate journaled control-file transaction. If interrupted, validation must refuse further apply operations until it deterministically completes or rolls back the pair.

Exit gate:

- A full API inventory preserves all 284 baseline identities.
- Current `src/live-stream-list.md` can be regenerated byte-for-byte before cutover.
- Every proposed addition is reviewable before it enters the canonical index.
- Key material is absent from stdout, stderr, reports, Git status, and generated files.
- Interrupted canonical writes leave either the prior valid pair or a journaled, detected state that the repair command restores before normal work continues.

### Phase 4: Implement Resumable Direct-To-TXT Transcript Fetching

Port and adapt:

- `youtube-transcript-plus` primary fetch.
- Direct watch-page/caption-track fallback.
- Manual-English, English-auto, then first-available language preference.
- Sequential shared request limiter.
- Single-video and batch CLIs.
- Stored skip, limit, dry-run, retry, and force behavior.
- Failure classification:
  - `no_caption_tracks`
  - `language_unavailable`
  - `empty_transcript`
  - `rate_limited_or_blocked`
  - `fetch_failed`
- Metadata readiness for scheduled, live, processing, and completed streams.

Required changes from the naval implementation:

- Keep transcript data in memory until TXT serialization.
- Write no raw transcript JSON.
- Emit the current indexed/tab-separated TXT contract.
- Discard raw per-segment timing/renderer data after recording only the approved transcript-level manifest metadata.
- Use the manifest-owned legacy `fileStem`.
- Reject canonical writes for video IDs absent from `episodes.json`; permit unregistered canaries only under an explicit ignored output root.
- Treat a transcript as stored only when both a valid manifest record and valid TXT exist.
- Store and validate canonical-LF SHA-256, canonical byte length, line/segment count, and summarized timing in every manifest record.
- Refetch a missing TXT for an existing manifest record into the same stable path.
- Require video-ID-scoped `--force` plus the expected current canonical hash to replace a valid stored TXT.
- Keep retry selection separate from overwrite: `--retry-failed` never bypasses stored-file detection, and convenience retry commands never add `--force`.
- Permit replacement only through the single-video command or an explicit reviewed video-ID allowlist; do not support unscoped batch-global force.
- Make `--dry-run` network-free and canonical-write-free, including no `fetch-status.json` timestamp churn.
- Set `youtube-transcript-plus` internal retries to zero and route all of its video-page, player-metadata, and caption-data fetch hooks plus the fallback through one shared limiter.
- Apply request pacing to every outbound request made by the primary library and fallback, not merely once per video.
- Apply an abort timeout to every request, enforce a tested maximum response size before parsing, and convert HTTP/network/timeout failures into typed sanitized errors.
- If the primary path observes 429, CAPTCHA, or blocking evidence, do not attempt the fallback; classify it immediately and trip the circuit breaker.
- Stop immediately after a blocking/rate-limit classification, record a bounded/sanitized `Retry-After` hint when present, checkpoint that attempt, leave the remainder pending, and exit nonzero instead of continuing through the queue.
- Treat a completed stream as ready only with positive duration and independent completion evidence such as `actualEndTime`; keep scheduled, live, processing, incomplete-metadata, and due-for-refresh states deferred.
- Make any short-duration exclusion explicit and tested rather than inheriting 61 seconds.
- Use the journaled deterministic commit protocol and per-file atomic replacements from the write-integrity contract; do not describe the multi-file operation as atomic.
- Compare status content before writing. Stored skips and no-op reruns must not update timestamps or rewrite tracked status; volatile run summaries belong under ignored `reports/`.

Exit gate:

- Fixture tests cover all parsers and failure classes.
- A one-video canary written under ignored `reports/` has the expected TXT format and no JSON companion.
- A safe rerun skips valid stored files and makes no transcript requests.
- A dry run makes no network requests and leaves all canonical and status files byte-identical.
- Failures never create empty TXT files.
- Retry touches only selected failures; forced refetch preserves `fileStem` and the recovery copy until commit.
- A process interruption is recoverable by `check:transcript-store`.

### Phase 5: Switch Active Guidance While Retaining Rollback

Update:

- `README.md`
- `AGENTS.md`
- `.agents/skills/transcript-to-md-reference/SKILL.md`
- `.agents/skills/transcript-question-page-audit/SKILL.md`
- `scripts/Generate-live-stream-list.ps1` help/deprecation guidance
- package-script documentation
- transcript acquisition documentation

New guidance:

- TXT is the transcript source of record for curation and auditing.
- `manifest.json` resolves a video ID to its stable TXT file.
- The direct TypeScript pipeline creates new TXT files.
- JSON transcript files are legacy retained data until the post-deployment decision.
- TSV is not part of the tracked transcript store.
- Reports belong under ignored `reports/`.

Rollback boundary:

- Keep `scripts/Generate-live-stream-list.ps1`, `scripts/Get-YouTubeTranscriptJson.ps1`, its README, and `scripts/Convert-TranscriptJson.ps1` clearly marked as legacy rollback/verification tools through the first successful deployment.
- Before calling `Convert-TranscriptJson.ps1` a canonical rollback writer, replace its platform-dependent `Set-Content` output with explicit UTF-8-no-BOM LF bytes and fixture-test exact output. Until then, label its output diagnostic-only and require normalization before store admission.
- Remove them from the normal documented workflow.
- Do not delete them or `src/transcripts/json/` in the migration feature branch.
- Remove stale claims that `src/live-stream-list.txt` or a populated `src/transcripts/tsv/` currently exists.

Exit gate:

- No active instruction tells contributors or agents to create a new transcript JSON.
- No active script help or documentation presents `Generate-live-stream-list.ps1` as a competing canonical index writer after the `episodes.json` cutover.
- Remaining JSON instructions are explicitly labeled legacy, rollback-only, or post-deployment cleanup.
- The retained converter either emits the canonical LF contract exactly or is clearly barred from direct canonical-store writes.
- Transcript curation and audit skills resolve and inspect TXT first without requiring JSON.

### Phase 6: Prove The Feature Branch, Merge, And Deploy

Offline validation:

```powershell
npm ci
npm run check:offline
```

`check:functional` is the network-free functional aggregator for:

```powershell
npm run check:types
npm run test:typescript
npm run check:transcript-store
npm run check:stream-index
npm run check:js
pwsh -NoProfile -File scripts/Test-HugoSite.ps1 -SkipHugo
npm run test:legacy
```

`check:offline` runs `check:functional` and then the repository-cleanliness assertions:

```powershell
git diff --exit-code
git diff --check
```

Use `check:offline` in PR and Pages workflows so the gates cannot drift. `npm ci` remains the separate dependency-install step and is not part of either aggregator. The Hugo compatibility step regenerates site/search data before the legacy search tests, and `git diff --exit-code` proves tracked generated data is current. Also run the full Hugo/rendered SEO checks when Hugo is available.

Required fixture coverage:

- Key precedence, BOM trimming, missing/empty key, and secret-safe errors.
- Compiled CommonJS loading of Node built-ins and both acquisition dependencies.
- Malformed and unsupported control-file schemas fail closed without replacement.
- Stream-index parse/render round trip.
- Candidate-by-default inventory and explicit accepted-delta apply behavior.
- Stable slug and `fileStem` preservation.
- Duplicate and path-traversal rejection.
- TXT formatting below and above one hour.
- Caption cleanup, canonical LF hashing across LF/CRLF legacy checkouts, and final-newline behavior.
- Manifest/TXT stored detection.
- Missing-TXT repair.
- Dry-run, limit, retry, force, and idempotent rerun behavior.
- Forced replacement scope and transaction-journal commit/rollback recovery at every phase boundary.
- Inventory/index pair transaction recovery.
- Deferred scheduled/live/processing streams.
- All failure classifications and rate-limit circuit breaker.
- Request spacing using a fake clock/fetcher.
- Per-file atomic failure and transient Windows errors leave or recover the prior valid files.
- No transcript JSON output.

Live validation:

1. Run a limited inventory probe to ignored output.
2. Run the full inventory and review the delta before applying it.
3. Fetch one representative transcript to an ignored canary output root.
4. If a genuinely new eligible stream exists, store that one TXT in the repository and rerun to prove the second pass is a no-op.
5. Run `alternate:fetch:transcripts:safe` in dry-run/no-op mode across the canonical store.
6. Confirm `git diff origin/master -- src/transcripts/json` is empty.
7. Confirm all 282 baseline Git blob IDs and canonical-LF TXT hashes still match. Prove forced replacement only with fixtures or an ignored canary; refetching a baseline transcript is outside this migration PR.

Dependency proof without JSON:

- Create a disposable clone or temporary validation copy.
- Remove `src/transcripts/json/` only inside that disposable location.
- Run `npm run check:functional` there. Do not run the Git-cleanliness assertions because the proof intentionally removes tracked JSON in that disposable copy.
- Do not delete or move JSON in the feature-branch worktree.

CI:

- Add a build-only pull-request validation workflow, or an equivalently guarded job, for Node/TypeScript tests and Hugo static validation.
- Use Node 22 and `npm ci`.
- Run the complete offline/Hugo gate on Ubuntu and at least the TypeScript storage/path/locking suite on Windows to cover case-folded paths, reserved names, junctions, and replacement/lock behavior.
- Run no live YouTube requests.
- Configure no API secret for validation.
- Keep `.github/workflows/pages.yml` master-based and Hugo-based.
- Add the offline TypeScript/tooling gate before its existing Hugo build.
- Include `check:stream-index` and `check:transcript-store` in CI, and do not downgrade the repository's existing GitHub Actions versions.
- Keep the existing `site/public` artifact and Pages deployment steps.

Merge and deployment gate:

- Review a focused PR from `codex/typescript-transcript-pipeline` into `master`.
- Confirm the PR contains no deletion or modification under `src/transcripts/json/`.
- Confirm the merge commit exists on `origin/master`.
- Confirm the automatic Pages workflow succeeded for that exact commit.
- Confirm the deployed environment reports that commit.
- Smoke-test the public home page, search, representative numbered and special question pages, canonical URLs, and sitemap.
- Confirm direct-to-TXT write behavior and stored no-op behavior have both been demonstrated.

The transcript-pipeline migration is complete only when all of those gates pass.

### Phase 7: Post-Deployment JSON And History Removal

This is not part of the migration PR. Stop after Phase 6 and obtain separate authorization.

A normal `git rm src/transcripts/json/*.json` removes the files only from the current tree; it does not remove their historical blobs. Removing them "from file history" requires a coordinated history rewrite.

That rewrite can remove the paths from the authoritative repository's intended reachable refs; it cannot revoke copies already present in forks, clones, backups, pull-request caches, or provider retention systems.

Preconditions:

- The TypeScript/TXT pipeline is merged and deployed from `origin/master`.
- A fresh clone can build, validate, and use the new tooling without transcript JSON.
- A separately reviewed normal cleanup commit removes `src/transcripts/json/` from the current tree and removes, relocates, or makes ignored-diagnostic-only every legacy tool/document whose default behavior can recreate tracked transcript JSON, including `Get-YouTubeTranscriptJson.ps1`, its README, and the JSON converter workflow.
- Baseline Git blob IDs, canonical-LF TXT hashes, and manifest mappings are archived.
- All branches, tags, pull-request refs, and collaborators are re-enumerated.
- A push freeze and maintenance window are agreed.
- An access-controlled offline full Git bundle or mirror backup is created.
- Remote branch protections and deployment behavior are understood.

Proposed destructive operation, to be revalidated at that time:

1. Merge and deploy the reviewed current-tree cleanup commit before rewriting history.
2. Work in a disposable mirror clone, not the normal checkout.
3. Record exact expected remote object IDs for every ref to be rewritten.
4. Audit historical paths so the filter targets only transcript payload JSON.
5. Rewrite intended refs with the exact path `src/transcripts/json/` excluded, using `git filter-repo` or an equivalent reviewed tool.
6. Verify no unrelated path or commit content changed.
7. Force-update only coordinated refs, using exact expected old object IDs as leases where supported.
8. Do not leave an origin backup branch or tag that keeps the removed blobs reachable.
9. Require existing clones to reclone or explicitly reset to the rewritten history.
10. Validate from a new clone and trigger a new Hugo Pages deployment.

Post-rewrite exit gate:

- No `src/transcripts/json/` path exists in the current tree.
- No active tracked tool or documentation defaults to recreating transcript JSON in that path.
- `git rev-list --objects --all` exposes no transcript JSON path in intended reachable refs.
- All retained canonical-LF TXT hashes, Git blob preservation expectations, and manifest mappings are valid.
- Inventory, status, and TXT-only ingestion checks pass.
- The API key is absent from every reachable ref.
- Node/TypeScript, search, Hugo, rendered SEO, and live Pages checks pass.

Rollback after a history rewrite requires restoring the offline bundle and coordinating another force-push. That risk is why Phase 7 must remain separate.

## File-Level Implementation Map

Create:

- `.gitattributes`
- `tsconfig.json`
- TypeScript acquisition/storage modules under `src/scripts/` and `src/youtube/`
- Shared atomic-write, lease, and transaction-journal modules under `src/pipeline/`
- TypeScript fixture tests
- `src/channel/episodes.json`
- `src/channel/video-metadata.json`
- `src/transcripts/manifest.json`
- `src/transcripts/fetch-status.json`
- A build-only pull-request validation workflow if one does not already exist

Modify:

- `package.json`
- `package-lock.json`
- `.gitignore`
- `.github/workflows/pages.yml` only to add offline tooling validation
- `README.md`
- `AGENTS.md`
- The two transcript curation/audit skills
- `scripts/Generate-live-stream-list.ps1`
- `scripts/Get-YouTubeTranscriptJson.ps1`
- `scripts/Get-YouTubeTranscriptJson.README.md`
- `scripts/Convert-TranscriptJson.ps1`
- `scripts/Test-HugoSite.ps1`
- `scripts/Build-HugoSiteContent.ps1`

Keep unchanged in the migration PR:

- `src/transcripts/json/*.json`
- All existing `src/transcripts/txt/*.txt`, except a separately reviewed new transcript addition
- `docs/questions/*.md`
- Hugo framework/configuration/layouts
- Generated `site/content/questions/` policy
- Existing public routes and Pages artifact path

Retain as legacy rollback-only until after deployment:

- `scripts/Generate-live-stream-list.ps1`
- `scripts/Get-YouTubeTranscriptJson.ps1`
- `scripts/Get-YouTubeTranscriptJson.README.md`
- `scripts/Convert-TranscriptJson.ps1`

## Principal Risks And Mitigations

| Risk | Mitigation |
| --- | --- |
| API refresh renames 282 transcript files or public routes | Bootstrap the manifest first; existing `fileStem` and slug always win |
| Official uploads inventory is partial, wrong-channel, or includes non-stream videos | Pin the reviewed channel ID, require complete pagination for apply, filter on normalized livestream metadata, default to a report, and never auto-prune the baseline |
| Root ESM conversion breaks current search tests/build | Keep root CommonJS and compile strict TypeScript to CommonJS |
| New TXT differs from the established curation format | Implement the current formatter and fixture-test exact bytes |
| Windows CRLF checkout bytes produce false hash drift | Store canonical-LF hashes/lengths, preserve Git blob IDs, add `.gitattributes`, and keep raw checkout hashes diagnostic-only |
| TXT-only discards raw per-segment fields needed later | Accept the information boundary before implementation and preserve only approved transcript-level provenance in the manifest |
| YouTube blocks/rate limits a batch | Sequential shared limiter, 60-second safe mode, durable checkpoint, and circuit breaker |
| A crash leaves manifest/status/TXT or episodes/index inconsistent | Per-file atomic replacement, write-ahead journals, recovery copies, a single-writer lease, and fail-closed reconciliation |
| The key is leaked | Ignored file, no logging, no CI acquisition, secret-safe tests |
| A retry convenience command overwrites valid transcripts | Keep retry selection separate from video-ID-scoped force and reject unscoped batch replacement |
| A dependency/parser update changes output or CJS behavior | Lock reviewed versions and require compiled interop plus exact formatter/failure fixture tests before upgrades |
| Hidden code still requires JSON | Disposable JSON-free validation before merge |
| Legacy JSON is removed before rollback is safe | No JSON deletion or history rewrite in Phases 0-6 |
| History rewrite disrupts collaborators or deployment | Separate approval, backup, push freeze, exact refs, fresh-clone validation, redeploy |
| Astro components from the reference repo displace Hugo | Port acquisition modules only; keep Hugo build and Pages artifact unchanged |

## Final Definition Of Done

The migration is done when:

- The feature branch is merged into `origin/master`.
- The exact merged commit builds and deploys the Hugo site successfully.
- `npm run fetch:livestreams` uses the ignored local key, defaults to registering the newest numbered addition from a complete pinned-channel result, and offers an explicit non-applying diagnostic mode.
- `npm run alternate:fetch:transcripts:safe` writes only TXT transcript payloads.
- A real or isolated canary proves direct-to-TXT output.
- A second run proves stored/no-op behavior with byte-identical canonical/status files and no requests.
- `check:stream-index` proves the Markdown projection is exact.
- Inventory, manifest, status, canonical hashes, journal state, and TXT validation pass.
- Existing search and Hugo behavior pass.
- No existing transcript JSON was changed or removed.
- Durable documentation and skills describe TXT as the source of record.

Removal of transcript JSON from current and historical Git state is deliberately not included in that definition. It begins only after a separate post-deployment authorization.

## Repository Evidence Reviewed

Current repository:

- `package.json`
- `.gitignore`
- `AGENTS.md`
- `README.md`
- `task-notes/README.md`
- `scripts/Generate-live-stream-list.ps1`
- `scripts/Get-YouTubeTranscriptJson.ps1`
- `scripts/Get-YouTubeTranscriptJson.README.md`
- `scripts/Convert-TranscriptJson.ps1`
- `scripts/Build-HugoSiteContent.ps1`
- `scripts/Test-HugoSite.ps1`
- `tests/search-index.test.js`
- `tests/search-highlight.test.js`
- `site/assets/js/search-core.js`
- `site/hugo.yaml`
- `.github/workflows/pages.yml`
- `src/live-stream-list.md`
- Full transcript inventories, all 282 TXT files, and all 766,759 JSON/TXT renderer-line pairs

Reference repository:

- `package.json`
- `tsconfig.json`
- `.gitignore`
- `src/scripts/get-channel-video-links.ts`
- `src/scripts/fetch-video-metadata.ts`
- `src/scripts/get-video-transcript.ts`
- `src/scripts/fetch-transcript-batch.ts`
- `src/scripts/youtube-api-key-file.ts`
- `src/youtube/channel-video-links.ts`
- `src/youtube/video-metadata.ts`
- `src/youtube/transcripts.ts`
- `src/youtube/batch-transcripts.ts`
- `src/pipeline/atomic-write.ts`
- Relevant writer-lease and atomic-write helpers/tests under `.codex/hooks/` and `src/pipeline/`
- Relevant TypeScript tests
- `src/transcripts/manifest.json`
- `src/transcripts/fetch-status.json`
- `.github/workflows/deploy-site.yml`
