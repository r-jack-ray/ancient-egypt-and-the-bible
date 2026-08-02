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
3. Several large site/search JSON files are deterministic build outputs but are tracked. Both CI workflows run `check:offline`, whose static-site validation regenerates these outputs before the Pages Hugo render.
4. `check:question-tables` always writes detailed ignored JSON and Markdown reports. CI and other repository code consume its exit status, not those files.
5. Reports have different audiences but share one directory: inventory and revision reports are maintainer review artifacts, while table-validation reports are diagnostics. The API key no longer shares this directory; it has been moved to ignored local configuration.
6. `bootstrap:transcript-store` is documented as a one-time migration command and refuses to run once the typed store exists. The migration is complete, so this is a candidate for retirement after recovery needs are reviewed.
7. `README.md` maintains an explicit link for every curated page in addition to the canonical directory and generated site indexes. This creates a large manual synchronization surface.
8. Strict unused-code checking currently reports at least two unused imports in `src/youtube/transcripts.ts`; the normal TypeScript configuration does not enable `noUnusedLocals` or `noUnusedParameters`.
9. The general-purpose `googleapis` package is used only by `src/youtube/inventory.ts` and `src/youtube/metadata.ts` for the YouTube channels, playlist-items, and videos endpoints. Node 22 already supplies `fetch`, so a small typed YouTube Data API client is a viable replacement candidate.
10. Internal Hugo generation reads the generated `src/live-stream-list.md` projection and parses it back into episode records instead of reading canonical `src/channel/episodes.json`. Git history confirms that this was an intentional July 25 compatibility boundary carried through the August 1 PowerShell-to-TypeScript port; the owner confirmed that the boundary no longer has a purpose.
11. Generated Hugo question mirrors copy the complete authoritative Markdown body even though valid question pages are rendered from `site/data/questions.json`. The `.Content` branch is only a fallback, while the generator refuses pages with no Q&A rows.
12. Every generated question row stores `search_text`, even though it is a deterministic concatenation of the episode number, title, question, short answer, and expanded answer. The search-index builder already has equivalent fallback derivation.
13. `validateRepositoryStore` and the separate stream-index validator both check the obsolete Markdown projection. Inventory-transaction detection and repair remain useful, but should operate on the canonical Node-owned files without preserving the projection.
14. The initial command-surface cleanup removed the duplicate `--noEmit` compile from the aggregate functional check. The Windows CI job still repeats type-checking before the compiled TypeScript tests and remains a later consolidation candidate.
15. `InventoryCandidate.candidateEpisodes` is built but has no reader. It duplicates the baseline plus all additions and is serialized only because the entire candidate object is written as the review report.
16. `EpisodeRecord.lifecycle` has no reader. It can be initialized as scheduled/live/processing/private, but metadata refresh does not update it; canonical readiness decisions instead use `video-metadata.json`. It is redundant and potentially stale.
17. Several other episode fields are derivable (`url` from `videoId`, `order` from array position, `fileStem` from `slug` under the current enforced equality, and `linkText` from episode number/title). These are low-priority schema-review candidates because explicit storage may still be valuable for readability or future divergence.
18. The initial command-surface cleanup removed the migration-era `alternate:` prefix and the raw/safe/latest/retry transcript alias matrix. The canonical `fetch:transcripts` command now uses safe pacing and processes every eligible registered stream missing TXT; canary limits and failure retries remain explicit options.
19. The owner subsequently removed `fetch:livestreams:latest`. It fetched the same complete inventory as `fetch:livestreams` and differed only by automatically applying and accepting the newest numbered addition. The base command already exposes explicit apply and acceptance flags, so the alias added convenience rather than capability. One README invocation of the removed alias remains to be corrected.
20. The single-video `fetch:transcript` command is of questionable value. It exposes targeted canary and forced-replacement behavior, but the owner does not use it and does not recognize a current need for it. References from README, AGENTS, and the transcript skills describe the command but are not independent consumers. Unless a concrete recovery workflow is identified, remove the npm entry, CLI, and those fallback references; use `fetch:transcripts -- --limit 1` for an ordinary one-item canary.
21. The local YouTube API key fallback has been moved from `reports/youtube-api-key.txt` to `.local/youtube-api-key.txt`. The resolver, help/documentation references, and ignore rules now use the local path, leaving `reports/` for generated artifacts and diagnostics.

## Processing baseline

- Public npm command surface after the current cleanup: 27 entries, reduced from 33. The removed entries are the completed bootstrap exposure, four redundant transcript aliases, and the automatic `fetch:livestreams:latest` apply shortcut.
- Current generated Hugo question mirrors: 283 files and 8.23 MiB, nearly duplicating the 7.99 MiB authoritative `docs/questions/` corpus in the build workspace.
- Current `site/data/questions.json`: 13,931 rows and 21.20 MB; its redundant `search_text` values account for approximately 7.28 MB (6.95 MiB) before JSON punctuation/whitespace effects.
- Current client search payload: 25.71 MB raw for documents plus index, approximately 6.48 MB with gzip level 9 or 4.30 MB with Brotli quality 11. Both files are functionally used; this is a performance target, not unused output.
- Current installed dependencies: 247.65 MiB. `node_modules/googleapis` alone is 197.87 MiB (79.9%) and 1,851 files; its lockfile closure contains 47 packages.
- Static source reachability: all 41 TypeScript files are reachable from a script or test root. There is no whole orphan module to delete blindly.
- The optional question-revision reporting subsystem is approximately 955 TypeScript lines across its implementation, tests, and CLI. It is a meaningful deletion only if the maintainer confirms that the triage report is no longer used.

## Candidate phases

### Phase 0: Establish measurements and invariants

- Record the routine weekly command sequence, network-request count, canonical and report files written, repeated transformations, and validation duration.
- Record the exact source-to-generated dependency chain and all CI/local consumers.
- Run the current offline and site checks before implementation to establish a clean baseline.
- Define rollback points and require a clean Git diff after every phase.

### Phase 1: Remove the obsolete stream projection and simplify canonical-to-site data flow

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

- Implement a narrow typed YouTube Data API client on Node 22 `fetch` for the three used endpoints.
- Preserve API-key precedence, pagination, 50-ID metadata batching, request delay, response normalization, and safe error messages.
- Inject the fetch implementation so channel discovery, pagination, missing fields, API errors, and metadata batching can be tested without network access.
- Remove `googleapis`, its `gaxios` override, and the resulting transitive lockfile closure only after behavioral parity tests pass.

Validation gate:

- Fixture-backed tests for channels, playlist items, videos, pagination, partial/malformed responses, HTTP errors, and request spacing.
- One separately authorized live report-only inventory canary; no canonical apply during dependency migration validation.
- Record dependency count, install size, install time, and type-check/test results before and after.

### Phase 3: Clean up the two independent weekly acquisition stages

Preserve two separate, independently rerunnable commands. They use different data sources and should not be joined by a wrapper or shared transaction.

The current worktree now exposes `fetch:livestreams` as the only public Google inventory command. Its default remains review-only; accepted additions are applied with explicit flags. Do not restore the removed `fetch:livestreams:latest` automatic-acceptance alias. Replace its one remaining README invocation with the base command and explicit acceptance behavior.

1. **Google API inventory and metadata**
   - Pull livestream links and their normalized metadata together.
   - Present newly discovered streams for the existing guarded acceptance step, then register the accepted additions.
   - Reuse the metadata already returned during discovery instead of immediately making a second metadata request.
   - Keep a standalone metadata refresh/repair path only for later schedule changes, incomplete records, or explicit full refreshes; it is not another routine weekly step.
2. **Caption scrape to canonical TXT**
   - Separately scan all registered livestreams for missing valid manifest-backed TXT files; do not limit routine selection to one item named `latest`.
   - Skip valid stored TXT files and records marked `known_unavailable`, currently two.
   - If captions are not ready or a scrape fails, leave the item eligible for a later run unless it is deliberately marked known unavailable.
   - Write successful results directly to canonical TXT with no intermediate transcript JSON.
   - Preserve conservative request spacing and resumable/checkpointed behavior so a partial run can be rerun safely.
   - Print a concise deterministic handoff containing newly stored TXT paths plus deferred or failed records. Do not create another permanent report unless a consumer is identified.

After acquisition, processing passes to Codex rather than another deterministic repository command: run `$transcript-to-md-reference` once for each new TXT, then run `$transcript-question-page-audit` twice as two independent full-transcript audits of each created page.

Keep the canonical `fetch:transcripts` name and safe default introduced by the initial scripts cleanup. Use its explicit `--limit` and `--retry-failed` options instead of restoring parallel safe, unsafe, latest, or retry aliases.

Treat `fetch:transcript` as questionable rather than part of the supported workflow. Retain it only if its scoped forced-replacement path is shown to be necessary for a real recovery procedure; otherwise remove it and its self-referential documentation in this phase.

Validation gate:

- Google API fixtures cover no additions, multiple additions, guarded selection, metadata reuse, schedule changes, and explicit refresh/repair.
- Caption-scraper fixtures cover multiple missing TXT files, existing valid TXT no-ops, the two known-unavailable skips, captions not yet ready, partial failure and rerun, direct TXT output, and request spacing.
- Prove the two commands succeed, fail, and recover independently. A caption-scrape failure must not roll back accepted inventory, and rerunning either stage must not duplicate records or overwrite valid stored TXT.
- Prove the transcript command's new-TXT handoff is complete and deterministic enough to drive one creation task and two independent audits per page.

### Phase 4: Clarify report ownership and lifecycle

- Keep the stream inventory candidate when running review-only discovery; make report emission optional or failure-focused for the ordinary weekly workflow after accepted additions are explicit.
- Write a concise inventory delta for human review rather than serializing the entire internal candidate. Include source identity, completeness, additions, omissions, title changes, and excluded-upload summary; full metadata remains internal to the apply transaction.
- Keep question-revision CSV/Markdown only if the maintainer still uses them as a triage backlog. Otherwise retire the command, module, tests, and obsolete task note together.
- Change clean question-table validation to emit a concise console summary. Write detailed JSON/Markdown only on failure or behind an explicit report option.
- Fold the stdout-only transcript-problem summary into the canonical archive-state/status command, or rename it as a status command instead of a report if it remains separate.
- Completed: move the local API key fallback from `reports/` to ignored `.local/youtube-api-key.txt`, while retaining `YOUTUBE_API_KEY` and `--api-key-file` precedence. Keep `reports/` limited to generated artifacts and diagnostics.
- Document who reads each retained report, when it is generated, and how it is cleaned.

### Phase 5: Consolidate validation and CLI plumbing

- Completed for the aggregate functional command: remove its duplicate `--noEmit` compilation while retaining compilation through the TypeScript test build. The Windows CI job still repeats type-checking and compilation and remains a separate consolidation candidate.
- Make one canonical offline validation pipeline and have CI jobs call it instead of restating overlapping subsets.
- Consider shared CLI helpers only for repeated, behaviorally identical parsing/error patterns; do not create a large framework for small scripts.
- Enable or add a dedicated unused-code check, then remove verified unused imports and unreachable exports in a separate mechanical change.
- Combine stream-index transaction detection with full transcript-store validation so routine maintenance and CI can use one archive-state command without running the projection comparison twice. Keep targeted repair flags explicit.
- Make the canonical `check` name accurately represent the supported default, with clearly named quick, functional, and CI/worktree-clean variants.

### Phase 6: Consolidate Markdown table parsing

- Compare the strict parser and validation rules in `src/questions/table-analysis.ts`, `src/questions/revision-candidates.ts`, and `src/site/build-content.ts`.
- Establish one shared parser/result model for the overlapping four-column table structure.
- Keep site-specific timestamp/video validation separate where its semantics differ.
- Add cross-consumer fixtures before removing duplicate parsing code.
- Once the site builder uses the shared strict parser, remove the redundant full-corpus table pass from the aggregate check if it adds no distinct failing invariant. Keep the targeted table CLI for page-scoped curation.

### Phase 7: Retire completed processing-migration residue

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

- Whether question-revision reports are actively used as a work queue.
- Whether inventory candidate reports should remain mandatory for the ordinary Google API links/metadata workflow.
- Whether replacing `googleapis` with a narrow native client is preferred over retaining vendor-maintained request/response types.
- Whether any demonstrated recovery procedure still requires the owner-unused `fetch:transcript` single-video command. Default disposition: remove it if no concrete consumer is found.

## Completed cleanup slices

1. Reduced and renamed the npm command surface from 33 entries to 27.
2. Made `fetch:livestreams` the sole public links-and-metadata command; removed the automatic `latest` apply alias without removing its explicit flags from the base CLI.
3. Made safely paced `fetch:transcripts` the ordinary all-eligible-missing transcript command and removed the migration-era transcript alias matrix.
4. Renamed the JavaScript search test and local Hugo server commands, and removed duplicate TypeScript compilation from the aggregate functional check.
5. Removed the completed bootstrap from the public npm surface while retaining the underlying recovery code for later review.
6. Moved the YouTube API key fallback to ignored `.local/youtube-api-key.txt` and updated its resolver and references.
7. Updated CLI help, README, AGENTS, and transcript-skill references for the initial command renames. A stale README reference to the subsequently removed `fetch:livestreams:latest` alias remains.

## Remaining implementation order

1. Remove the obsolete Markdown stream projection and complete the canonical-to-site data-flow cleanup, including lean mirrors and removal of redundant `search_text`.
2. Finish the weekly command cleanup: remove the stale README `latest` invocation, decide whether to delete owner-unused `fetch:transcript`, and add the concise new-TXT/deferred handoff to the batch command.
3. Decide report ownership, then remove or make conditional the reports with no active human or machine consumer.
4. Consolidate validation, CLI plumbing, and Markdown table parsing while preserving distinct invariants.
5. Replace the broad Google API dependency if its behavioral parity tests justify the maintenance tradeoff.
6. Retire the bootstrap and other completed processing-migration residue after recovery-path review.
7. Consider generated site/search tracking policy only as a separate follow-up after the processing cleanup is complete.

## Verification record

Owner decision recorded on 2026-08-01: `src/live-stream-list.md` is obsolete after the PowerShell-to-Node migration and should be removed rather than retained as a compatibility artifact.

History review completed on 2026-08-01: the list began as a genuine maintained master file, became a PowerShell acquisition/Hugo input, and was deliberately retained as a temporary projection during the July 25 TypeScript/TXT migration. The August 1 TypeScript site-builder port carried that input forward after the original PowerShell consumer was removed. Phase 1 should therefore remove the whole projection round trip while preserving `episodes.json` as the existing canonical authority.

Cleanup timing confirmed by the owner on 2026-08-01: this review directly follows today's large PowerShell-to-TypeScript site change. Newly introduced site/report/validation structure should be judged as fresh porting structure, not defended merely because it is now the current implementation.

Scope refinement confirmed by the owner on 2026-08-01: the legacy transcript JSON extraction and history cleanup are already complete. This plan is focused on processing cleanup and must not grow into another repository-storage or history-rewrite project.

Retention decision confirmed by the owner on 2026-08-01: `task-notes/` is staying because it preserves the reasoning and sequence behind project changes. Removing it would make future process analysis less accurate and force historical decisions to be rediscovered.

Weekly workflow confirmed by the owner on 2026-08-01: pull livestream links and metadata; fetch every eligible missing transcript directly to TXT while skipping the two known-blocked records; run the TXT-to-Markdown creation agent for each new transcript; then run two independent audits on each created Markdown page. This sequence has been tested successfully with the latest livestream.

Acquisition boundary confirmed by the owner on 2026-08-01: links and metadata can be combined because both use the official Google API. Transcript retrieval is inherently a separate caption-scraping process and must remain a distinct second stage rather than being folded into the API command.

Initial command-surface cleanup completed on 2026-08-01: the public npm scripts now use `fetch:livestreams`, `refresh:livestream-metadata`, `fetch:transcript`, and safely paced `fetch:transcripts`; the transcript alias matrix, migration-era `alternate:` prefix, completed bootstrap entry, `legacy` test label, and duplicate aggregate type compilation were removed. CLI help, README, AGENTS, and skill references were updated with the names.

Automatic latest alias removed by the owner on 2026-08-01: `fetch:livestreams:latest` was only a preset for applying and accepting the newest numbered addition after the same inventory fetch. `fetch:livestreams` is sufficient because it retains explicit `--apply`, `--accept-source`, `--accept-latest`, and `--accept-addition` options. One README invocation still needs removal.

API key relocation completed by the owner on 2026-08-01: the fallback file now lives at ignored `.local/youtube-api-key.txt`; source and documentation references were updated. The key contents were not inspected.

Questionable command recorded by the owner on 2026-08-01: `fetch:transcript` is not used by the owner, and its purpose is not recognized as part of the supported weekly process. Do not treat documentation references as proof of use; require a concrete recovery consumer or remove the single-video command in a later cleanup slice.

Validation status for the scripts cleanup: the renamed command help paths, 42 compiled TypeScript tests, 16 JavaScript search tests, transcript/store checks, question-table validation, and static site/search checks passed before the subsequent API-key relocation and `latest` alias removal. The safely paced batch dry run reported 283 stored transcripts and two known-unavailable records. Re-run targeted validation after the remaining README and questionable-command cleanup is implemented.

Remaining phases still require their own implementation-time verification. This plan was originally created without implementation changes; completed cleanup slices are now recorded explicitly above.
