# Processing Cleanup Plan

Timestamp: 2026-08-01T20:03:18-05:00

## Purpose

Simplify the repository's processing paths, remove fresh migration residue, reduce redundant commands and transformations, and give every retained report or validation step a concrete consumer without weakening transcript integrity, guarded inventory acceptance, or the public Hugo/search experience.

This is an immediate cleanup pass after commit `1155531` (`move from Powershell to Typescript processing`) on 2026-08-01. Treat the newly ported TypeScript site, question, report, and validation modules as a parity baseline to simplify before their current structure becomes an assumed long-term contract.

## Scope and constraints

- This file now tracks both the analysis and the cleanup work completed from it. Mark implemented slices explicitly and keep remaining proposals separate; do not treat an unimplemented plan bullet as authorization for unrelated code, canonical-data, generated-data, or public-content changes.
- Compare today's TypeScript replacements directly with the PowerShell code they replaced and distinguish behavior that is still required from structure that was carried over only for migration parity.
- Keep the July 25 transcript acquisition/store migration separate from today's site-tooling migration. Do not remove acquisition safety mechanisms merely because both migrations use TypeScript.
- The legacy transcript JSON removal and Git-history rewrite are complete and out of scope. Do not reopen, revalidate, repeat, or extend that storage project during this processing cleanup.
- Treat tracked deterministic site/search output policy as a separate optional follow-up. It may be informed by this analysis, but repository-size reduction is not the driver for this pass.
- Preserve `task-notes/` as project history and decision evidence. Do not prune, relocate, or delete its plans as cleanup residue; they provide the process origin needed for later maintenance reviews.
- Preserve `docs/questions/` and `src/transcripts/txt/` as authoritative human-curated and transcript payload surfaces.
- Preserve guarded acceptance for newly discovered livestreams and scoped transcript replacement safeguards.
- Keep network-backed acquisition separate from offline validation.
- Implement later work in small, independently reviewable phases with before/after checks.

## Process origin confirmed from Git history

1. Commit `0d1b4da` (2025-05-17, `live stream links master file`) created the Markdown archive with 223 YouTube links. It predated the TypeScript pipeline and was originally a maintained master list, not an internal Node artifact.
2. Commit `31746de` (2026-06-13, `reorganize project`) moved the file unchanged to `src/live-stream-list.md`.
3. Commit `2779a2b` (2026-06-14, `add script to generate the basic live stream list`) added the PowerShell scraper that generated the list. The subsequent PowerShell transcript downloader read the list to decide which video IDs and slugs to process.
4. Commit `49d089b` (2026-06-29, `add hugo compatibility site`) made the PowerShell Hugo-content builder parse the list into site episode data. At that point the file served acquisition, routing, and Hugo generation.
5. The July 25 migration plan and implementation commit `0e18202` introduced `src/channel/episodes.json` as canonical authority. The plan deliberately bootstrapped it from the existing list, required byte-equivalent projection parity, retained the list as a generated Hugo compatibility output, and explicitly avoided changing Hugo during the transcript-pipeline cutover.
6. Commit `1bc1679` (2026-07-26, `document weekly transcript workflow`) documented inventory acceptance as updating `episodes.json`, metadata, and the Markdown projection together. Commit `6756f0b` (2026-08-01) added the short latest-stream command while retaining that projection step.
7. Commit `1155531` (2026-08-01, `move from Powershell to Typescript processing`) removed the PowerShell processing suite. Its new TypeScript Hugo builder directly carried forward the old behavior by reading and parsing `src/live-stream-list.md`, even though `episodes.json` was already canonical.

Therefore, removing `src/live-stream-list.md` now completes the authority transition that the July 25 plan intentionally staged. The file's original role was real, but the current projection writer, parser, parity test, transaction member, and Node-to-Markdown-to-Node round trip are compatibility residue after the PowerShell retirement.

## Confirmed supported weekly workflow

This sequence was proven with the latest livestream and is the behavior that processing cleanup must preserve:

1. Pull the channel's livestream links and metadata. Review and register valid additions under the existing acceptance safeguards; do not make a second redundant metadata request for the same inventory result.
2. For every registered livestream without a valid canonical TXT transcript, fetch captions and serialize them directly to TXT. Skip records explicitly marked as known blocked (`known_unavailable`), currently two, and defer scheduled, live, or otherwise not-ready streams for a later run.
3. For each newly stored TXT, run the `$transcript-to-md-reference` creation agent to create the authoritative Q&A Markdown page.
4. Run `$transcript-question-page-audit` twice as two independent full-transcript audit tasks on the resulting Markdown page.

The deterministic processing has two intentional acquisition boundaries: the official Google API owns links and metadata, while the separate caption-scraping process owns missing-transcript selection and direct-to-TXT storage. Codex then owns transcript-grounded Markdown creation and the two independent audits. Cleanup may reduce redundancy inside each boundary, but must not combine the API and scrape operations, collapse the two audits into one pass, or hide which TXT/page still needs agent work.

## Confirmed structural observations

1. `fetch:video-links:latest` already performs channel discovery and full YouTube metadata retrieval. Its apply transaction updates `src/channel/episodes.json`, `src/channel/video-metadata.json`, and `src/live-stream-list.md` together. The separate `fetch:video-metadata` command is a refresh/repair path, not a required second weekly discovery step.
2. The proven weekly workflow intentionally uses a second command after inventory because transcript captions come from a separate scraping process rather than the Google API. Keep that boundary; simplify the Google link/metadata command and the missing-transcript batch independently.
3. Several large site/search JSON files are deterministic build outputs but are tracked. All validation jobs now run `check:ci`, which delegates to the canonical `check:offline` pipeline and verifies that static-site regeneration leaves tracked output clean before the Pages Hugo render.
4. `check:question-tables` writes detailed ignored JSON and Markdown reports only on failure or explicit request. Phase 6 moved its hard-error invariants into the shared parser used by static site generation, so the targeted CLI remains a curation tool rather than a second aggregate full-corpus pass.
5. Reports have different audiences but share one directory: inventory and revision reports are maintainer review artifacts, while table-validation reports are diagnostics. The API key no longer shares this directory; it has been moved to ignored local configuration.
6. `bootstrap:transcript-store` is documented as a one-time migration command and refuses to run once the typed store exists. The migration is complete, so this is a candidate for retirement after recovery needs are reviewed.
7. `README.md` maintains an explicit link for every curated page in addition to the canonical directory and generated site indexes. This creates a large manual synchronization surface.
8. Phase 5 enabled `noUnusedLocals` and `noUnusedParameters` for normal TypeScript compilation and removed the two unused imports in `src/youtube/transcripts.ts` that the stricter check identified.
9. The general-purpose `googleapis` package is used only by `src/youtube/inventory.ts` and `src/youtube/metadata.ts` for the YouTube channels, playlist-items, and videos endpoints. Node 22 already supplies `fetch`, so a small typed YouTube Data API client is a viable replacement candidate.
10. Internal Hugo generation reads the generated `src/live-stream-list.md` projection and parses it back into episode records instead of reading canonical `src/channel/episodes.json`. Git history confirms that this was an intentional July 25 compatibility boundary carried through the August 1 PowerShell-to-TypeScript port; the owner confirmed that the boundary no longer has a purpose.
11. Generated Hugo question mirrors copy the complete authoritative Markdown body even though valid question pages are rendered from `site/data/questions.json`. The `.Content` branch is only a fallback, while the generator refuses pages with no Q&A rows.
12. Every generated question row stores `search_text`, even though it is a deterministic concatenation of the episode number, title, question, short answer, and expanded answer. The search-index builder already has equivalent fallback derivation.
13. `validateRepositoryStore` and the separate stream-index validator both check the obsolete Markdown projection. Inventory-transaction detection and repair remain useful, but should operate on the canonical Node-owned files without preserving the projection.
14. The initial command-surface cleanup removed the duplicate `--noEmit` compile from the aggregate functional check. Phase 5 removed the remaining Windows CI restatement; Linux, Windows, and Pages validation now use the same repository-owned CI command.
15. `InventoryCandidate.candidateEpisodes` is built but has no reader. It duplicates the baseline plus all additions and is serialized only because the entire candidate object is written as the review report.
16. `EpisodeRecord.lifecycle` has no reader. It can be initialized as scheduled/live/processing/private, but metadata refresh does not update it; canonical readiness decisions instead use `video-metadata.json`. It is redundant and potentially stale.
17. Several other episode fields are derivable (`url` from `videoId`, `order` from array position, `fileStem` from `slug` under the current enforced equality, and `linkText` from episode number/title). These are low-priority schema-review candidates because explicit storage may still be valuable for readability or future divergence.
18. The initial command-surface cleanup removed the migration-era `alternate:` prefix and the raw/safe/latest/retry transcript alias matrix. The canonical `fetch:transcripts` command now uses safe pacing and processes every eligible registered stream missing TXT; canary limits remain explicit, while recorded failures are automatically reconsidered by ordinary later runs.
19. The owner subsequently removed `fetch:livestreams:latest`. It fetched the same complete inventory as `fetch:livestreams` and differed only by automatically applying and accepting the newest numbered addition. The base command already exposes explicit apply and acceptance flags, so the alias added convenience rather than capability. Phase 3 confirmed that the README now uses the base command and explicit acceptance flags throughout.
20. Phase 3 found no independent recovery consumer for the owner-unused single-video `fetch:transcript` command and removed its npm entry, CLI, and self-referential README, AGENTS, and transcript-skill instructions. The all-eligible batch remains the only public caption command; `--limit 1` is a general canary rather than a video-ID selector.
21. The local YouTube API key fallback has been moved from `reports/youtube-api-key.txt` to `.local/youtube-api-key.txt`. The resolver, help/documentation references, and ignore rules now use the local path, leaving `reports/` for generated artifacts and diagnostics.

## Processing baseline

- Public npm command surface after the current cleanup: 26 entries, reduced from 33. Two explicit Phase 5 validation entry points (`check:quick` and `check:ci`) replaced ambiguous or workflow-local command combinations; the removed entries remain the completed bootstrap exposure, four redundant transcript aliases, the automatic `fetch:livestreams:latest` apply shortcut, the obsolete standalone stream-index validator, and the unused single-video transcript command. The earlier 25-entry planning snapshot had drifted from the post-Phase 4 `package.json`; this count is taken directly from the implemented script object.
- Current generated Hugo question mirrors: 283 files and 8.23 MiB, nearly duplicating the 7.99 MiB authoritative `docs/questions/` corpus in the build workspace.
- Current `site/data/questions.json`: 13,931 rows and 21.20 MB; its redundant `search_text` values account for approximately 7.28 MB (6.95 MiB) before JSON punctuation/whitespace effects.
- Current client search payload: 25.71 MB raw for documents plus index, approximately 6.48 MB with gzip level 9 or 4.30 MB with Brotli quality 11. Both files are functionally used; this is a performance target, not unused output.
- Current installed dependencies: 247.65 MiB. `node_modules/googleapis` alone is 197.87 MiB (79.9%) and 1,851 files; its lockfile closure contains 47 packages.
- Static source reachability: all 41 TypeScript files are reachable from a script or test root. There is no whole orphan module to delete blindly.
- The optional question-revision reporting subsystem was 1,032 TypeScript lines across its implementation, tests, and CLI. Repository references, generated artifacts, and Git history showed no active human or machine consumer, so Phase 4 retired it while preserving its historical task note.

## Candidate phases

### Phase 0: Establish measurements and invariants

- Record the routine weekly command sequence, network-request count, canonical and report files written, repeated transformations, and validation duration.
- Record the exact source-to-generated dependency chain and all CI/local consumers.
- Run the current offline and site checks before implementation to establish a clean baseline.
- Define rollback points and require a clean Git diff after every phase.

### Phase 1: Remove the obsolete stream projection and simplify canonical-to-site data flow

Status: completed on 2026-08-01. The implementation removed the Markdown projection and standalone validator; narrowed inventory transactions to `episodes.json` and `video-metadata.json`; moved transaction detection and recovery into the canonical transcript/archive-state check; switched Hugo generation and question-tool root detection to Node-era canonical markers; generated front-matter-only question stubs; removed the question-template `.Content` fallback after rendered proof; removed intermediate `search_text`; and removed the unused `lifecycle` and `candidateEpisodes` fields. Broader episode-schema minimization was not implemented.

- Make `src/channel/episodes.json` the sole canonical archive inventory read by all Node tooling.
- Treat this as completion of the July 25 staged authority transition, not as a new source-of-truth change: `episodes.json` has already been canonical since that migration.
- Remove `src/live-stream-list.md`; its PowerShell-era compatibility purpose is gone.
- Delete `parseStreamIndex`, `renderStreamIndex`, their round-trip tests, and exact Markdown-projection validation.
- Remove the stream-index text from the inventory transaction journal and recovery code. Preserve atomic recovery for `episodes.json` and `video-metadata.json`.
- Move remaining inventory-transaction detection and repair into the canonical archive-state validator, then retire the standalone `check:stream-index` command if it has no distinct responsibility.
- Update repository-root detection in question tooling so it uses durable Node-era markers such as `package.json`, `docs/questions/`, and `src/channel/episodes.json` rather than `src/live-stream-list.md`.
- Replace README and AGENTS references to the Markdown archive with the live episodes page or canonical episode store as appropriate.
- Generate front-matter-only Hugo question stubs rather than copying the full Q&A table into ignored mirrors. Remove the unreachable `.Content` fallback only after a full render proves every supported question page is data-backed.
- Remove generated `search_text` from `site/data/questions.json` and derive it in the search builder and alias validator from the existing row fields.
- Review other duplicated row fields only with a complete consumer inventory; `docs.json` and `index.json` are both used and must not be mistaken for disposable duplicates.
- Remove `EpisodeRecord.lifecycle` unless a concrete canonical consumer and refresh rule are first established.
- Remove the unread `InventoryCandidate.candidateEpisodes` field. If a next-state preview is desired, generate it explicitly from the accepted selection rather than serializing all discovered additions as though they were one applied state.
- Treat broader episode-schema minimization as optional: quantify code simplification and migration risk before removing derivable but human-readable fields.

Validation gate:

- Builder unit tests for direct canonical episode reads, page metadata, descriptions, timestamps, and question rows.
- Inventory apply/recovery tests covering only the remaining canonical inventory and metadata files.
- Fresh static and full Hugo renders with rendered-output comparison for representative numbered and special pages.
- Search-index and alias tests with `search_text` absent from the intermediate row JSON.

### Phase 2: Replace the broad Google API dependency

Status: implemented on 2026-08-01. A narrow typed Node 22 `fetch` client now owns the channels, playlist-items, and videos calls; inventory and metadata retain their pagination, 50-ID batching, delay, normalization, API-key behavior, and bounded transient-request retries with injectable fetch, sleep, and clock dependencies. Offline parity gates passed, `googleapis` and the `gaxios` override were removed, and the plan's separately authorized live report-only inventory canary remains intentionally unrun.

- Implement a narrow typed YouTube Data API client on Node 22 `fetch` for the three used endpoints.
- Preserve API-key precedence, pagination, 50-ID metadata batching, request delay, bounded transient-request retries, response normalization, and safe error messages.
- Inject the fetch implementation so channel discovery, pagination, missing fields, API errors, and metadata batching can be tested without network access.
- Remove `googleapis`, its `gaxios` override, and the resulting transitive lockfile closure only after behavioral parity tests pass.

Validation gate:

- Fixture-backed tests for channels, playlist items, videos, pagination, partial/malformed responses, HTTP errors, bounded transient retries, and request spacing.
- One separately authorized live report-only inventory canary; no canonical apply during dependency migration validation.
- Record dependency count, install size, install time, and type-check/test results before and after.

### Phase 3: Clean up the two independent weekly acquisition stages

Status: implemented on 2026-08-01 and reviewed on 2026-08-02. The two stages remain separate and independently rerunnable. Inventory continues to reuse discovery metadata under guarded apply, with added no-addition and multiple-addition fixtures. The caption batch now uses one rate limiter across episode boundaries, always skips known-unavailable records, applies limits consistently during dry runs, checkpoints partial failures, scans the remaining state without further requests after blocking evidence, and prints a deterministic handoff listing new TXT paths and all deferred, failed, or pending records. Review corrected recorded failures being skipped indefinitely by the ordinary weekly command, removed the resulting redundant retry option, clears stale failure status for stored or known-unavailable records, and ensures a primary-provider CAPTCHA trips the circuit breaker without a fallback request. The unused single-video command and its self-referential documentation were removed; the README `latest` invocation named by the earlier analysis was already absent in the implementation worktree.

Preserve two separate, independently rerunnable commands. They use different data sources and should not be joined by a wrapper or shared transaction.

The current worktree now exposes `fetch:livestreams` as the only public Google inventory command. Its default remains review-only; accepted additions are applied with explicit flags. Do not restore the removed `fetch:livestreams:latest` automatic-acceptance alias. Keep README examples on the base command and explicit acceptance behavior.

1. **Google API inventory and metadata**
   - Pull livestream links and their normalized metadata together.
   - Present newly discovered streams for the existing guarded acceptance step, then register the accepted additions.
   - Reuse the metadata already returned during discovery instead of immediately making a second metadata request.
   - Keep a standalone metadata refresh/repair path only for later schedule changes, incomplete records, or explicit full refreshes; it is not another routine weekly step.
2. **Caption scrape to canonical TXT**
   - Separately scan all registered livestreams for missing valid manifest-backed TXT files; do not limit routine selection to one item named `latest`.
   - Skip valid stored TXT files and records marked `known-unavailable`, currently two.
   - If captions are not ready or a scrape fails, leave the item eligible for a later run unless it is deliberately marked known unavailable.
   - Write successful results directly to canonical TXT with no intermediate transcript JSON.
   - Preserve conservative request spacing and resumable/checkpointed behavior so a partial run can be rerun safely.
   - Print a concise deterministic handoff containing newly stored TXT paths plus deferred or failed records. Do not create another permanent report unless a consumer is identified.

After acquisition, processing passes to Codex rather than another deterministic repository command: run `$transcript-to-md-reference` once for each new TXT, then run `$transcript-question-page-audit` twice as two independent full-transcript audits of each created page.

Keep the canonical `fetch:transcripts` name and safe default introduced by the initial scripts cleanup. Use its explicit `--limit` option for canaries instead of restoring parallel safe, unsafe, latest, or retry aliases. Do not require a retry mode: a recorded failure still lacks TXT and must remain eligible on an ordinary later run unless its episode is deliberately marked `known-unavailable`.

No concrete recovery consumer was found for `fetch:transcript`, so Phase 3 removed it and its self-referential documentation. Keep `fetch:transcripts` as the only public caption command.

Validation gate:

- Google API fixtures cover no additions, multiple additions, guarded selection, metadata reuse, schedule changes, and explicit refresh/repair.
- Caption-scraper fixtures cover multiple missing TXT files, existing valid TXT no-ops, the two known-unavailable skips, captions not yet ready, partial failure and rerun, direct TXT output, and request spacing.
- Prove the two commands succeed, fail, and recover independently. A caption-scrape failure must not roll back accepted inventory, and rerunning either stage must not duplicate records or overwrite valid stored TXT.
- Prove the transcript command's new-TXT handoff is complete and deterministic enough to drive one creation task and two independent audits per page.

### Phase 4: Clarify report ownership and lifecycle

Status: implemented and review-corrected on 2026-08-02. Review-only inventory discovery now writes a concise human delta without internal metadata, while accepted apply runs write no report unless `--output` is explicit. The unconsumed question-revision report command, module, and tests are retired, while its historical task note remains as process evidence. Clean question-table validation is console-only; failures print their errors and write the detailed pair, and explicit `--report` runs can also write it on success. The stdout-only transcript-problem command is now `status:transcripts`, and README documents every retained report's reader, generation boundary, and cleanup lifecycle.

- Keep the stream inventory candidate when running review-only discovery; make report emission optional or failure-focused for the ordinary weekly workflow after accepted additions are explicit.
- Write a concise inventory delta for human review rather than serializing the entire internal candidate. Include source identity, completeness, additions, omissions, title changes, and excluded-upload summary; full metadata remains internal to the apply transaction.
- Retire the question-revision CSV/Markdown command, module, and tests because no active human or machine consumer exists. Preserve its historical task note as process evidence under the repository-wide `task-notes/` retention decision.
- Change clean question-table validation to emit a concise console summary. Write detailed JSON/Markdown only on failure or behind an explicit report option.
- Fold the stdout-only transcript-problem summary into the canonical archive-state/status command, or rename it as a status command instead of a report if it remains separate.
- Completed: move the local API key fallback from `reports/` to ignored `.local/youtube-api-key.txt`, while retaining `YOUTUBE_API_KEY` and `--api-key-file` precedence. Keep `reports/` limited to generated artifacts and diagnostics.
- Document who reads each retained report, when it is generated, and how it is cleaned.

### Phase 5: Consolidate validation and CLI plumbing

Status: implemented and review-corrected on 2026-08-02. `check` now delegates to the canonical network-free `check:offline` pipeline; `check:quick` exposes TypeScript/unused-code and JavaScript syntax checks; `check:functional` remains the policy-free functional proof path; and `check:ci` adds generated-output/worktree cleanliness. The Linux, Windows, and Pages jobs all call `check:ci`, removing the Windows-only restatement and duplicate compilation. Normal TypeScript builds enforce unused locals and parameters, and the two confirmed unused imports were removed. A survey found heterogeneous argument semantics rather than repeated behaviorally identical CLI parsing, so no shared CLI framework was introduced. No export was removed without concrete consumer evidence. Stream/inventory and transcript transaction detection was already consolidated in `check:transcript-store` during Phase 1 and remains unchanged with its explicit repair flag. Review proved `check:ci` end to end in a clean temporary clone and corrected the Phase 6 handoff after Phase 4 retired the question-revision parser; no Phase 5 implementation defect was found.

- Retain compilation through the TypeScript test build without a second aggregate `--noEmit` pass.
- Keep `check:offline` as the one canonical network-free validation pipeline and route every CI validation job through `check:ci`.
- Add shared CLI helpers only when future scripts repeat behaviorally identical parsing or error semantics.
- Enforce unused locals and parameters in normal TypeScript compilation and remove only compiler-confirmed dead code.
- Keep inventory and transcript transaction detection in the canonical archive-state validator with explicit `--repair-transaction` behavior.
- Keep `check`, `check:quick`, `check:functional`, `check:offline`, and `check:ci` aligned with their documented default, bounded, policy-free, network-free, and worktree-clean roles.

### Phase 6: Consolidate Markdown table parsing

Status: implemented and reviewed on 2026-08-02. `parseQuestionTableText` now provides the shared strict parser and parsed-row/result model for table analysis and Hugo generation, including row locations, named cells, normalized timestamp data, structural diagnostics, expanded-answer policy, and report metrics. The site builder consumes those shared rows and diagnostics while retaining its distinct episode/video-ID check. Cross-consumer fixtures cover shared divider and interruption failures plus the separate video invariant. Because `check:site:static` already processes the complete question corpus through this parser and fails on every hard-error invariant, the redundant `check:question-tables` invocation was removed from `check:functional`; the focused CLI and its diagnostics remain available. Follow-up review found no Phase 6 implementation defect or remaining duplicate table/timestamp parser.

- Compare the strict parser and validation rules in `src/questions/table-analysis.ts` and `src/site/build-content.ts`. The retired `src/questions/revision-candidates.ts` parser no longer exists and is not a consolidation target.
- Establish one shared parser/result model for the overlapping four-column table structure.
- Keep site-specific timestamp/video validation separate where its semantics differ.
- Add cross-consumer fixtures before removing duplicate parsing code.
- Once the site builder uses the shared strict parser, remove the redundant full-corpus table pass from the aggregate check if it adds no distinct failing invariant. Keep the targeted table CLI for page-scoped curation.

### Phase 7: Retire completed processing-migration residue

Status: implemented and independently reviewed on 2026-08-02. The tracked canonical store, fresh-clone CI/Pages paths, and active recovery tooling have no bootstrap dependency. README now documents coherent Git/fresh-clone restoration and keeps unfinished-transaction repair distinct from file recovery. The obsolete bootstrap entrypoint and its two archive helpers are retired; the historical manifest provenance value and migration task notes remain intact. No public command or canonical input changed, so AGENTS, skills, and command help required no Phase 7 edit.

- Update README, AGENTS, skills, and command help only where processing commands or canonical inputs change; broad documentation pruning is outside this pass.
- The public one-time bootstrap npm entry is already removed. Retire its underlying code only after documenting the supported recovery path and proving no fresh-clone or disaster-recovery workflow depends on it.

### Deferred follow-up: generated site/search tracking policy

The following deterministic files are rebuilt by the site/search pipeline and GitHub workflows, but changing whether they are tracked is a repository-output policy decision rather than part of the focused processing cleanup:

- `site/data/episodes.json`
- `site/data/questions.json`
- `site/static/search/docs.json`
- `site/static/search/index.json`
- `site/static/search/manifest.json`

If handled later, keep `site/data/search-aliases.json` tracked as authored source and prove a fresh clone can run direct tests, static validation, the full Hugo render, and rendered-site validation when the generated files begin absent. Do not attach another Git-history rewrite to this follow-up.

## Decision points requiring owner confirmation

- Resolved in Phase 4: question-revision reports had no active human or machine consumer and were retired; their historical task note remains.
- Whether inventory candidate reports should remain mandatory for the ordinary Google API links/metadata workflow.
- Whether replacing `googleapis` with a narrow native client is preferred over retaining vendor-maintained request/response types.

## Completed cleanup slices

1. Reduced and renamed the npm command surface from 33 entries to 26, including explicit quick and CI/worktree-clean validation entry points.
2. Made `fetch:livestreams` the sole public links-and-metadata command; removed the automatic `latest` apply alias without removing its explicit flags from the base CLI.
3. Made safely paced `fetch:transcripts` the ordinary all-eligible-missing transcript command and removed the migration-era transcript alias matrix.
4. Renamed the JavaScript search test and local Hugo server commands, and removed duplicate TypeScript compilation from the aggregate functional check.
5. Removed the completed bootstrap from the public npm surface while retaining the underlying code for the later recovery-path review.
6. Moved the YouTube API key fallback to ignored `.local/youtube-api-key.txt` and updated its resolver and references.
7. Updated CLI help, README, AGENTS, and transcript-skill references for the supported command names and removed the obsolete single-video acquisition fallback.
8. Completed Phase 1 canonical-to-site cleanup, including removal of `src/live-stream-list.md`, the standalone stream-index command, redundant question-row and episode fields, full-body Hugo mirrors, and the data-backed question-template fallback.
9. Completed Phase 2 with a narrow injected-fetch YouTube Data API client, fixture-backed endpoint and integration tests, safe API errors, bounded transient-request retries, and removal of `googleapis`, its `gaxios` override, and 47 lockfile packages.
10. Completed Phase 3 with two independently rerunnable acquisition commands, one shared cross-video caption limiter, automatic later-run recovery for recorded failures, deterministic new-TXT/deferred/failed/pending handoff output, fixture-backed failure and circuit-break coverage, and retirement of `fetch:transcript`.
11. Completed Phase 4 with concise review-only inventory deltas, report-free accepted apply runs by default, failure-focused question-table diagnostics with CI-visible errors, retirement of the unconsumed question-revision report implementation, the renamed transcript status command, and documented report ownership and cleanup.
12. Completed Phase 5 with one canonical offline pipeline, one shared Linux/Windows/Pages CI gate, accurate default/quick/functional/CI check names, compiler-enforced unused-code checks, and removal of the two confirmed unused imports without a CLI-helper framework.
13. Completed Phase 6 with one shared strict Markdown table parser/result model, cross-consumer structural fixtures, site-only episode/video validation, and removal of the redundant aggregate full-corpus table invocation while retaining the targeted CLI.
14. Completed Phase 7 by documenting Git-based canonical-store recovery and retiring the obsolete bootstrap entrypoint and archive helpers after proving no active fresh-clone, CI, Pages, or transaction-recovery path depends on them.

## Remaining implementation order

1. Processing cleanup Phases 0 through 7 are complete.
2. Consider generated site/search tracking policy only as a separately authorized follow-up; it is not another phase or automatic continuation of this cleanup.

## Verification record

Owner decision recorded on 2026-08-01: `src/live-stream-list.md` is obsolete after the PowerShell-to-Node migration and should be removed rather than retained as a compatibility artifact.

History review completed on 2026-08-01: the list began as a genuine maintained master file, became a PowerShell acquisition/Hugo input, and was deliberately retained as a temporary projection during the July 25 TypeScript/TXT migration. The August 1 TypeScript site-builder port carried that input forward after the original PowerShell consumer was removed. Phase 1 should therefore remove the whole projection round trip while preserving `episodes.json` as the existing canonical authority.

Cleanup timing confirmed by the owner on 2026-08-01: this review directly follows today's large PowerShell-to-TypeScript site change. Newly introduced site/report/validation structure should be judged as fresh porting structure, not defended merely because it is now the current implementation.

Scope refinement confirmed by the owner on 2026-08-01: the legacy transcript JSON extraction and history cleanup are already complete. This plan is focused on processing cleanup and must not grow into another repository-storage or history-rewrite project.

Retention decision confirmed by the owner on 2026-08-01: `task-notes/` is staying because it preserves the reasoning and sequence behind project changes. Removing it would make future process analysis less accurate and force historical decisions to be rediscovered.

Weekly workflow confirmed by the owner on 2026-08-01: pull livestream links and metadata; fetch every eligible missing transcript directly to TXT while skipping the two known-blocked records; run the TXT-to-Markdown creation agent for each new transcript; then run two independent audits on each created Markdown page. This sequence has been tested successfully with the latest livestream.

Acquisition boundary confirmed by the owner on 2026-08-01: links and metadata can be combined because both use the official Google API. Transcript retrieval is inherently a separate caption-scraping process and must remain a distinct second stage rather than being folded into the API command.

Initial command-surface cleanup completed on 2026-08-01: at that intermediate point, the public npm scripts used `fetch:livestreams`, `refresh:livestream-metadata`, `fetch:transcript`, and safely paced `fetch:transcripts`; the transcript alias matrix, migration-era `alternate:` prefix, completed bootstrap entry, `legacy` test label, and duplicate aggregate type compilation were removed. CLI help, README, AGENTS, and skill references were updated with the names.

Automatic latest alias removed by the owner on 2026-08-01: `fetch:livestreams:latest` was only a preset for applying and accepting the newest numbered addition after the same inventory fetch. `fetch:livestreams` is sufficient because it retains explicit `--apply`, `--accept-source`, `--accept-latest`, and `--accept-addition` options. Phase 3 confirmed the README uses the base command and explicit flags.

API key relocation completed by the owner on 2026-08-01: the fallback file now lives at ignored `.local/youtube-api-key.txt`; source and documentation references were updated. The key contents were not inspected.

Single-video command decision resolved on 2026-08-01: no concrete recovery consumer existed beyond the command's own documentation, so Phase 3 removed `fetch:transcript`, `src/scripts/get-video-transcript.ts`, and the README, AGENTS, and transcript-skill fallbacks. Scoped batch canaries use `fetch:transcripts -- --limit 1`; valid stored transcripts remain non-overwritable through the batch.

Validation status for the scripts cleanup: the renamed command help paths, 42 compiled TypeScript tests, 16 JavaScript search tests, transcript/store checks, question-table validation, and static site/search checks passed before the subsequent API-key relocation and `latest` alias removal. The safely paced batch dry run reported 283 stored transcripts and two known-unavailable records. Phase 3 reran the targeted validation after completing the remaining command cleanup, as recorded below.

Phase 1 implementation validation completed on 2026-08-01: 45 compiled TypeScript tests and 16 JavaScript search tests passed; canonical archive validation reported 285 episodes, 283 stored transcripts, and two known-unavailable records; all 283 question pages and 13,931 question rows passed strict table, alias, static-site, and full Hugo validation. Representative numbered and special pages were byte-identical to the pre-change render after the canonical-read, lean-stub, and derived-search-text changes. Removing the unreachable fallback then changed only template whitespace for those representatives, and the second full render passed all 287 rendered-page canonical, metadata, title, sitemap, SEO, and internal-link checks.

Phase 2 implementation validation completed on 2026-08-01: all 51 compiled TypeScript tests and 16 JavaScript search tests passed, including fixture-backed channels, playlist-items, videos, pagination, partial and malformed responses, HTTP and network errors, 50-ID batching, and request-spacing cases. Type checking, focused IDE inspections, diff checks, and canonical transcript-store validation also passed. The lockfile dependency count fell from 81 to 34, installed size from 259,684,782 bytes (247.65 MiB) and 3,071 files to 39,432,066 bytes (37.61 MiB) and 362 files, and one cached clean-install sample fell from 8.339 seconds to 1.179 seconds. The separately authorized live report-only inventory canary was not run, and no canonical apply occurred.

Phase 2 review follow-up completed on 2026-08-01: review found that the removed Google request client had supplied default transient retries while the first narrow `fetch` implementation made only one attempt. The replacement client now makes at most three retries after the initial request with 100/200/400 ms exponential waits for transport failures, unreadable successful or retryable responses, HTTP 408/429, and 5xx responses; permanent 4xx and malformed successful payloads still fail immediately. Injected timing remains available through inventory and metadata callers. Deterministic retry-success, exhaustion, non-retryable-error, and secret-redaction coverage brought the compiled TypeScript suite to 52 passing tests; the full functional stack and 16 JavaScript search tests also passed. The live report-only inventory canary remained intentionally unrun, and no canonical apply occurred.

Phase 3 implementation validation completed on 2026-08-01: all 57 compiled TypeScript tests and 16 JavaScript search tests passed. New fixtures covered inventory with no additions and multiple additions; guarded selection and metadata reuse; multiple ready missing transcripts; existing valid TXT no-ops; both known-unavailable skips; scheduled and metadata-missing deferrals; direct TXT and manifest writes; shared cross-video request spacing; dry-run limits; partial failure, checkpoint, explicit retry, and blocking handoff behavior. Type checking, both updated skill validators, all three acquisition help paths, the canonical batch dry run, archive validation, stale-command searches, and diff checks passed. Focused IDE inspection found only the two pre-existing unused imports in `src/youtube/transcripts.ts` already recorded for the later unused-code cleanup. The canonical dry run reported 285 episodes represented by 283 stored TXT files and two known-unavailable records, with no pending work or canonical writes. No live network canary or canonical inventory apply was run.

Phase 3 review follow-up completed on 2026-08-02: the ordinary batch now retries every ready, missing TXT even when a prior failure is recorded, so a not-yet-ready caption cannot become permanently invisible to the weekly command. The redundant `--retry-failed` switch and its active documentation were removed; the older migration plan remains unchanged as historical process evidence. Normal runs clear stale failure records already resolved by stored TXT or deliberate `known-unavailable` policy, while dry runs remain write-free. Success checkpoints now sit outside the fetch/store catch so checkpoint write errors cannot be mislabeled as YouTube failures. A typed conversion for `youtube-transcript-plus` CAPTCHA/rate-limit errors prevents the fallback from making a second request after primary blocking evidence. All 58 compiled TypeScript tests, the complete functional validation stack, 16 JavaScript search tests, the updated CLI help, and the canonical dry run passed; the dry run again reported 283 stored and two known-unavailable records with no pending work or writes. No live network canary or canonical inventory apply was run.

Phase 4 implementation validation completed on 2026-08-02: all 60 compiled TypeScript tests and 16 JavaScript search tests passed, including new concise-inventory-report and conditional-question-diagnostic coverage. Type checking, the complete functional validation stack, archive validation, the 283-page/13,931-row question-table check, static Hugo/search compatibility validation, both changed CLI help paths, transcript status, focused IDE inspection, stale-command searches, and diff checks passed. Transcript status reported 285 episodes, 283 stored TXT files, two known-unavailable records, no pending records, and no recorded failures. No live network request or canonical inventory apply was run.

Phase 4 review follow-up completed on 2026-08-02: repository references and Git history showed that the question-revision CSV/Markdown pair was created as a heuristic AI triage aid, had no current human, code, or CI consumer, and was not present among generated reports. Its public command, TypeScript module, and tests were therefore retired instead of assigning unsupported maintainer ownership. The June 29 task note remains intact as historical evidence under the explicit `task-notes/` retention decision. Question-table failures now print each hard error for local and GitHub Actions readers as well as writing the ignored diagnostic pair. Type checking, all 56 remaining compiled TypeScript tests, all 16 JavaScript search tests, the complete functional validation stack, the 283-page/13,931-row table check, transcript status, stale-reference searches, and diff checks passed. No live network request, canonical inventory apply, staging change, or work beyond Phase 4 occurred.

Phase 5 implementation validation completed on 2026-08-02: `npm run check:quick` and the canonical `npm run check` passed with compiler-enforced unused locals and parameters, all 56 compiled TypeScript tests, all 16 JavaScript search tests, canonical archive validation for 285 episodes, 283 stored transcripts, and two known-unavailable records, the 283-page/13,931-row question-table check, static Hugo/search compatibility validation, and the no-legacy-JSON policy. Focused IntelliJ inspection reported no problem in the mechanically edited transcript module, both GitHub workflow files parsed as YAML, the active-reference search found every CI validation job using `check:ci`, and `git diff --check` passed. `check:ci` was not run end to end in the intentionally modified implementation worktree because its final clean-worktree assertion is expected to reject the phase diff; its canonical offline component and whitespace gate were run separately. No live network request, canonical inventory apply, staging change, CLI parser refactor, Phase 6 parsing work, or later-phase work occurred.

Phase 5 review follow-up completed on 2026-08-02: the current `npm run check:quick` and `npm run check` both passed, and the complete `npm run check:ci` command passed in a clean temporary clone containing the Phase 5 diff as its committed baseline. The review found no defect in the command graph, unused-code enforcement, Linux/Windows/Pages workflow routing, or removed imports. It found one stale next-phase instruction: Phase 6 still named `src/questions/revision-candidates.ts`, which Phase 4 had intentionally deleted after proving the report subsystem unconsumed. The Phase 6 scope now names only the two active Markdown table parsers. IntelliJ reported no Phase 5 errors; its warnings were pre-existing documentation/action-schema inspections on unchanged lines. The temporary proof clone was removed, and no live network request, canonical inventory apply, staging change, Phase 6 implementation, or later-phase work occurred.

Phase 6 implementation validation completed on 2026-08-02: the new cross-consumer fixtures first exposed the duplicate parsers' different divider diagnostics, then passed after consolidation. The targeted `check:question-tables` command validated all 283 pages and 13,931 rows with no errors or warnings, and `check:site:static` processed the same 283 pages and 13,931 rows through the shared parser with all search-alias and Hugo compatibility checks passing. The canonical `npm run check` passed with 58 compiled TypeScript tests, 16 JavaScript search tests, archive validation for 285 episodes, 283 stored transcripts, and two known-unavailable records, static site/search regeneration, and the no-legacy-JSON policy. `git diff --check` passed, generated site/search files remained unchanged, and focused IntelliJ inspection found no Phase 6 problem; its single warning was the pre-existing local-variable reuse on an unchanged site-builder line. No live network request, canonical data change, Hugo render, staging change, Phase 7 work, or generated-output tracking change occurred.

Phase 6 review follow-up completed on 2026-08-02: CodeGraph confirmed that the shared module now contains the only active ordinary-table row splitter, header matcher, timestamp-anchor parser, and timestamp-label converter, and traced both the validator and Hugo builder to `parseQuestionTableText`. Diff review confirmed that the builder still enforces the separate episode/video-ID invariant and that `check:site:static` covers every hard-error condition that can fail the default full-corpus table check. The 58 compiled TypeScript tests, canonical `npm run check`, focused `npm run check:question-tables`, IntelliJ inspection, and `git diff --check` all passed; both full-corpus paths processed 283 pages and 13,931 rows, the focused command reported zero errors and warnings, and regeneration changed no tracked site/search output. No code correction was necessary. No live network request, canonical data change, Hugo render, staging change, Phase 7 work, or generated-output tracking change occurred.

Phase 7 implementation validation completed on 2026-08-02: the reference and workflow audit found no active bootstrap command or consumer, all 287 canonical transcript-store paths are tracked (four control files and 283 TXT payloads), and the Linux, Windows, and Pages fresh-clone paths install dependencies and call `check:ci` without a bootstrap step. README now documents restoring coherent canonical paths from one reviewed Git commit or using a fresh clone, validating the result, reserving `--repair-transaction` for unfinished journals, and rerunning guarded acquisition only for uncommitted reviewed work. `src/scripts/bootstrap-transcript-store.ts`, `bootstrapTranscriptStore`, `writeBootstrapStore`, and their now-unused `atomicWriteJson` import were removed. CodeGraph found no remaining bootstrap symbol, and focused IntelliJ inspection found no new problem; its one warning is the pre-existing redundant condition on an unchanged validator line. The canonical `npm run check` passed before and after the change with 58 compiled TypeScript tests, 16 JavaScript search tests, archive validation for 285 episodes, 283 stored transcripts, and two known-unavailable records, plus static generation and validation for 283 question pages and 13,931 rows. `git diff --check` passed, and generated site/search files remained unchanged. No live network request, canonical data change, Hugo render, staging change, AGENTS/skill/help edit, or generated-output tracking change occurred.

Phase 7 review follow-up completed on 2026-08-02: CodeGraph independently confirmed that no active symbol, import, caller, or dependency path still uses the deleted bootstrap entrypoint or helpers; the only retained bootstrap wording in active TypeScript is the historical `legacy-json-bootstrap` manifest provenance value. Direct inspection confirmed that `--repair-transaction` remains a separate recovery mechanism covering the stale writer lease and both inventory and transcript journals. A temporary clean clone of `HEAD` with the complete Phase 7 patch applied contained all 287 tracked canonical store paths, completed `npm ci`, and passed `npm run check:ci`; the temporary clone was then removed. The current checkout also passed canonical `npm run check`, focused IntelliJ inspection found only the pre-existing redundant validator condition on an unchanged line, and no code correction was necessary. No canonical data, staging, later follow-up policy, or generated-output tracking change was made by the review.

The processing-cleanup cursor is complete. The generated site/search tracking policy remains a separate deferred follow-up requiring explicit authorization.
