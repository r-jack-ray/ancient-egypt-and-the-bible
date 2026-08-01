# Remove Legacy Transcript JSON From Git History

Created: 2026-07-26T00:48:21-05:00

Last reviewed: 2026-08-01

Status: Archive gate satisfied; updated implementation plan only. No JSON files, refs, or history were changed by this review. Do not start the cleanup or force-push until every remaining gate below is satisfied and the user gives the cutover go-ahead.

## Accepted Context

- This is raw-data size reduction, not sensitive-data removal.
- The user completed a 7z archive of the project in a different folder on 2026-08-01. Treat that rollback backup as done. Do not inspect, checksum, relocate, recreate, or delete it unless the user later asks.
- The established git-filter-repo procedure has been used successfully in this repository and naval-history-with-dr-alex.
- GitHub Support, cached views, pull-request refs, provider retention, credential rotation, and sensitive-data incident guidance are out of scope.

## Objective

Remove obsolete raw transcript JSON from:

- the current master tree
- every retained public writable branch and tag
- history reachable by an ordinary fresh clone

Preserve:

- src/transcripts/txt/
- src/transcripts/manifest.json
- src/channel/
- docs/questions/
- the Hugo site
- the TypeScript direct-to-TXT pipeline
- unrelated source and history

## Paths To Remove

Filter both paths:

~~~text
src/transcripts/json/
transcripts/livestreams/json/
~~~

The second is the former pre-reorganization location. Filtering only the current path would leave historical raw JSON reachable.

## Review Snapshot: 2026-08-01

This is planning evidence, not force-push input. Recollect every remote value immediately before the cutover.

| Item | Reviewed value |
| --- | --- |
| Local master | ce0bad5a4428f61948108ba5d8b3dd04f488d996 |
| Local master relationship | Two commits ahead of origin/master; those normal commits are not yet published |
| Remote master | 11f6f2615fe8336766644ccd190ea97366f3d223 |
| Remote writable refs | Live `git ls-remote` check returned master only; no remote tags or feature branch |
| Local feature branch | codex/typescript-transcript-pipeline at 544161e7b2c087ed2d63ec925e82abc3b5be2f5d |
| Feature branch status | Already an ancestor of master through merge commit 7ade4116baac88971c55fd5901576082a68d7e8f; still present locally |
| Current tracked JSON files | 282 |
| Current raw JSON size | 697,386,246 bytes (665.08 MiB) |
| Historical current-path names | 294 |
| Historical former-path names | 208 |
| Unique Git object IDs through both paths | 432 |
| Commits touching either path | 19 |
| Current Git pack size | 179.07 MiB |
| git filter-repo version output | a40bce548d2c |
| Manifest-backed TXT records | 283, each with contentSha256, canonicalByteLength, and segmentCount |
| Episode 272 production deployment | GitHub Pages workflow run [30714889518](https://github.com/r-jack-ray/ancient-egypt-and-the-bible/actions/runs/30714889518) succeeded for remote master 11f6f2615fe8336766644ccd190ea97366f3d223 |
| CI guard path | Both `.github/workflows/validate.yml` and `.github/workflows/pages.yml` run `npm run check:offline` |
| Signed refs | No signed commits detected; no local or remote tags exist at review time |

Additional findings:

- The local ce0bad5 migration already deletes the PowerShell JSON tools, including scripts/Get-YouTubeTranscriptJson.ps1 and scripts/Convert-TranscriptJson.ps1. Publish that normal migration; do not attempt to delete those paths a second time.
- Active legacy-retention wording currently remains in README.md and AGENTS.md. The audit skill contains a permanent instruction not to require legacy JSON; that remains useful after cleanup and should not be removed merely because it mentions JSON.
- src/archive.test.ts intentionally mentions a JSON-looking path only as a path-traversal negative test. Keep that test; it does not require a JSON payload.
- The original TypeScript TXT pipeline merge 7ade4116baac88971c55fd5901576082a68d7e8f is already contained in origin/master. The later local processing migration at ce0bad5 remains unpublished.
- Episode 272 is the TXT-only proof candidate: commit 199b0eb2cf0c91985b92dc3e1a8476bc51138de0 added its TXT payload from youtube-transcript-plus and changed no transcript JSON payload path. The audit log contains the first-pass entry followed by two full audit passes, ending at 70 questions with the source-name ambiguity preserved.
- Production deployment of episode 272 is verified: GitHub Pages workflow run [30714889518](https://github.com/r-jack-ray/ancient-egypt-and-the-bible/actions/runs/30714889518) completed successfully for 11f6f2615fe8336766644ccd190ea97366f3d223. Explicit user acceptance of this proof gate remains outstanding.
- The archive is complete. Remaining gates are publication/deployment of the later local migration, user acceptance of the episode proof, retirement of the local feature branch, the ordinary current-tree cleanup, and the final cutover review.

## Required Sequence

### 0. Publish And Deploy The Remaining Local Processing Migration

Before current-tree cleanup:

1. Review and publish the two current local master commits as ordinary, non-rewritten history. They include the later PowerShell-to-TypeScript processing migration and deletion of the legacy PowerShell tools.
2. Verify that the GitHub Pages deployment from those published commits succeeds.
3. Record the resulting origin/master SHA.
4. Leave all JSON payloads and history intact at this stage.

Do not use a history rewrite to publish the existing local migration.

### 1. Confirm The TXT-Only Episode Gate

First evaluate episode 272 rather than requiring another episode by calendar. The review has already established that:

- 199b0eb2cf0c91985b92dc3e1a8476bc51138de0 added the canonical TXT and manifest entry with source youtube-transcript-plus and did not add or change either legacy JSON payload path.
- the audit log records the 65-row first pass, a 70-row full audit, and a second 70-row full re-audit with no further high-confidence edits
- GitHub Pages workflow run [30714889518](https://github.com/r-jack-ray/ancient-egypt-and-the-bible/actions/runs/30714889518) successfully deployed its successor commit 11f6f2615fe8336766644ccd190ea97366f3d223

After Step 0 publishes the later local processing migration:

1. Confirm that the new successful production deployment contains both 11f6f2615fe8336766644ccd190ea97366f3d223 and the published processing-migration commit.
2. Run `npm run check:transcript-store` and reconfirm the episode 272 manifest facts and canonical TXT hash.
3. Reconfirm that no commit in the episode 272 change range added or changed either legacy JSON payload path.
4. Obtain the user's explicit acceptance that episode 272 proves the TXT-only workflow.

If any of those checks fails or the user wants a newer proof, process the next regular episode with the direct TXT workflow, $transcript-to-md-reference, and two independent $transcript-question-page-audit passes. Run npm ci and npm run check:site, then record its deployed commit and the user's acceptance.

Do not begin JSON cleanup if the proven weekly process still needs a legacy JSON script.

### 2. Retire The Merged Feature Branch

After the successful episode, verify the already-observed ancestry again:

~~~powershell
git merge-base --is-ancestor codex/typescript-transcript-pipeline master
git ls-remote --heads origin refs/heads/codex/typescript-transcript-pipeline
~~~

Delete a remote branch only if the second command actually reports one. Then delete the local branch:

~~~powershell
git branch -d codex/typescript-transcript-pipeline
~~~

Confirm it is absent from both local and remote branch listings. Do not create, restore, or force-push that branch during the rewrite.

### 3. Complete The Ordinary Current-Tree Cleanup

Complete the Ordinary Current-Tree Cleanup section below as a normal published and deployed master commit. Do not begin the mirror rewrite until its fresh-clone validation passes.

### 4. Final Cutover Review

Immediately before the mirror rewrite, after the ordinary current-tree cleanup is published:

1. Confirm the archive gate remains accepted; do not inspect the archive.
2. Confirm the successful TXT-only episode, deployment, and feature-branch retirement.
3. Confirm local work is committed or intentionally set aside. Do not discard unrelated work.
4. Query the remote directly:

   ~~~powershell
   git ls-remote --refs --heads --tags origin
   ~~~

5. Record every retained writable ref and its exact old SHA. `--refs` deliberately excludes peeled annotated-tag lines such as `refs/tags/name^{}`; those are not independently writable refs and must never become push targets or lease entries. Today this is one branch and no tags, but that can change.
6. Inventory signed commits and annotated or signed tags reachable from retained refs. Rewriting invalidates commit signatures and may strip tag signatures. Stop for an explicit preserve, recreate, or accept-loss decision if any appear. None existed at this review.
7. Record a clean master tree SHA after the ordinary current-tree cleanup:

   ~~~powershell
   git rev-parse master^{tree}
   ~~~

8. Refresh the file, object, pack-size, and git-filter-repo values in the review snapshot.
9. Run `npm run check:transcript-store` to verify the manifest-backed canonical TXT hashes before the rewrite.
10. Agree a short push freeze with every person or automation that can update the retained refs.
11. Generate one explicit force-with-lease command per recorded ref. Do not reuse the 2026-08-01 remote SHA as a lease value.

This is the final stop/go decision. Obtain the user's explicit approval before force-pushing rewritten public history.

## Ordinary Current-Tree Cleanup

Create a normal cleanup branch from the then-current published master, for example codex/remove-legacy-transcript-json. This is a standard commit and must be merged, deployed, and validated before history is rewritten.

### Remove Current Payloads And Update Active Guidance

Remove:

~~~text
src/transcripts/json/
~~~

Add these root .gitignore rules:

~~~gitignore
/src/transcripts/json/
/transcripts/livestreams/json/
~~~

Update active references found at cutover. At this review, that means:

- README.md: update the storage inventory, staging guidance, and weekly-workflow cleanup wording so TXT is the only tracked transcript payload and there is no instruction to retain the deleted JSON.
- AGENTS.md: remove the legacy JSON inventory entry and temporary-retention guidance.

Re-run the repository search before committing. Do not change historical task notes or audit-log entries merely because they document former JSON use. Do not remove the JSON-looking negative path in src/archive.test.ts. Keep the audit skill's instruction not to require legacy JSON; it remains a valid regression guard rather than temporary-retention wording.

The PowerShell JSON tools are already deleted by the unpublished TypeScript migration. Verify that their deletion has reached master; do not resurrect or duplicate that deletion in this cleanup branch.

### Add A Regression Check

Add a small cross-platform Node/TypeScript checker, for example check:no-legacy-json, which runs:

~~~text
git ls-files -- src/transcripts/json transcripts/livestreams/json
~~~

The checker must fail if Git exits unsuccessfully or if the command returns any path. Run Git from the resolved repository root, report the offending paths, and include the checker in `npm run check:offline`. Keep the check in repository-owned Node/TypeScript code rather than embedding a shell-specific pipeline in package.json.

The checker protects the tracked tree; the .gitignore rules prevent ordinary accidental re-addition of untracked payloads. Confirm both CI workflows still invoke `npm run check:offline` so the check gates pull requests and master deployments.

### Validate And Publish The Ordinary Cleanup

Run the tests from a clean checkout after the cleanup commit is created:

~~~powershell
npm ci
npm run check:no-legacy-json
npm run check:offline
npm run check:site
git diff --check
git status --short

$legacyPaths = @(git ls-files -- src/transcripts/json transcripts/livestreams/json)
if ($legacyPaths.Count -ne 0) {
  throw "Tracked legacy JSON remains; $($legacyPaths -join [Environment]::NewLine)"
}

$ignoreProbes = @(
  'src/transcripts/json/_probe.json',
  'transcripts/livestreams/json/_probe.json'
)
foreach ($probe in $ignoreProbes) {
  git check-ignore -v --no-index -- $probe
  if ($LASTEXITCODE -ne 0) {
    throw "Legacy JSON probe is not ignored: $probe"
  }
}
~~~

The final `git status --short` must be empty in the clean validation checkout. Merge, push, and deploy this ordinary cleanup. Confirm a fresh default-branch clone has no tracked legacy JSON before proceeding to the rewrite.

## History Rewrite Preparation

Do not rewrite the everyday checkout. Keep the existing checkout and the user-confirmed archive untouched until a fresh rewritten clone has passed validation.

1. Start the agreed push freeze.
2. Re-run `git ls-remote --refs --heads --tags origin` and compare it with the recorded ref snapshot. Stop if anything changed.
3. Create a fresh disposable mirror outside the everyday checkout:

   ~~~powershell
   git clone --mirror https://github.com/r-jack-ray/ancient-egypt-and-the-bible.git ancient-egypt-json-cleanup.git
   Set-Location ancient-egypt-json-cleanup.git
   ~~~

4. List `refs/heads/*` and `refs/tags/*` in the mirror and compare their names and object IDs exactly with the frozen remote snapshot. Also compare the mirror's master tree SHA with the clean tree SHA recorded before cloning. Stop and discard the mirror if any value differs.
5. Run the filter without `--force`, `--partial`, or `--refs`:

   ~~~powershell
   git filter-repo --invert-paths --path src/transcripts/json/ --path transcripts/livestreams/json/
   ~~~

6. If git-filter-repo rejects the repository's freshness, discard the disposable mirror and clone again. Do not bypass that safety check with `--force`.
7. Confirm git-filter-repo removed `origin`, and keep the rewritten mirror disconnected from GitHub throughout verification. A remote is not needed for local validation and must not be restored until the approved push phase.

Never use --mirror, --all, or a broad force-push to publish the rewritten mirror.

## Rewrite Verification

All of the following must pass before any remote ref is updated.

### Reachability And Ref Integrity

The target-path searches must produce no matches. Capture and assert the output rather than relying on visual inspection:

~~~powershell
$legacyObjects = @(git rev-list --objects --all |
  Select-String -Pattern '(^| )(src/transcripts/json/|transcripts/livestreams/json/)')
$legacyLog = @(git log --all -- src/transcripts/json transcripts/livestreams/json)
$legacyTree = @(git ls-tree -r master -- src/transcripts/json transcripts/livestreams/json)

if ($legacyObjects.Count -ne 0 -or $legacyLog.Count -ne 0 -or $legacyTree.Count -ne 0) {
  throw 'Legacy transcript JSON remains reachable after filtering.'
}
~~~

Also:

1. Compare the retained ref names with the pre-filter snapshot. Names must match exactly.
2. Confirm the post-filter master tree SHA equals the clean pre-filter master tree SHA recorded after ordinary current-tree cleanup.
3. Record an explicit table of each retained ref's name, pre-rewrite SHA, and post-rewrite SHA. Preserve git-filter-repo's commit map with the cutover evidence.
4. Confirm `HEAD` still resolves to `refs/heads/master` and that no `refs/replace/*` refs exist.
5. Run `git fsck --full --strict` and `git count-objects -vH`.
6. Confirm the local feature branch remains absent.

### Fresh-Clone Validation

Create a temporary ordinary clone from the rewritten mirror with local-clone optimization disabled. `--no-local` forces normal object transfer instead of hardlinking the mirror's object store:

~~~powershell
git clone --no-local <absolute-path-to-rewritten-mirror> <temporary-validation-clone>
Set-Location <temporary-validation-clone>
npm ci
npm run check:offline
npm run check:site
npm run check:no-legacy-json
git status --short
~~~

The transcript-store check inside `check:offline` must validate manifest video IDs, fileStem values, canonical TXT hashes, byte lengths, and segment counts. The full site check must validate the Hugo render, not only static generation. The final status output must be empty.

## Push Rewritten Refs

Only after verification passes and the user gives the explicit cutover approval:

1. Confirm `git remote -v` is empty in the rewritten mirror.
2. Add the push remote:

   ~~~powershell
   git remote add origin https://github.com/r-jack-ray/ancient-egypt-and-the-bible.git
   ~~~

3. Re-run `git ls-remote --refs --heads --tags origin` and require the entire output to match the frozen pre-rewrite snapshot exactly.

Before each push:

1. Re-query the corresponding remote ref and require it to equal the recorded old SHA.
2. Arrange a temporary, approved branch-protection exception if the host blocks the required update.
3. Run a dry-run of the exact single-ref command with its recorded lease.
4. Push only that one ref with that same explicit lease.

For a branch:

~~~powershell
git push --dry-run --force-with-lease=refs/heads/master:<recorded-old-sha> origin refs/heads/master:refs/heads/master
git push --force-with-lease=refs/heads/master:<recorded-old-sha> origin refs/heads/master:refs/heads/master
~~~

For any retained tag:

~~~powershell
git push --dry-run --force-with-lease=refs/tags/<tag>:<recorded-old-sha> origin refs/tags/<tag>:refs/tags/<tag>
git push --force-with-lease=refs/tags/<tag>:<recorded-old-sha> origin refs/tags/<tag>:refs/tags/<tag>
~~~

After every push, re-run `git ls-remote --refs --heads --tags origin` and require each updated ref to equal its recorded post-rewrite SHA while every not-yet-updated ref still equals its recorded pre-rewrite SHA. If any value differs, stop rather than weakening or removing the lease. If one ref succeeds and a later ref fails, keep the push freeze in place and ask the user whether to complete or roll back the partial cutover; do not choose automatically.

Restore ordinary branch protection after the final ref succeeds. The feature branch must stay deleted.

## Finish

1. Clone rewritten master into a new directory; do not automatically delete, reset, or replace the existing checkout.
2. Run `npm ci`, `npm run check:offline`, and `npm run check:site` in that fresh clone.
3. Verify the GitHub Pages workflow succeeds for the exact rewritten master SHA and confirm neither legacy path exists in the fresh clone.
4. Record fresh-clone Git object size and working-tree size for comparison with the review snapshot.
5. Have other active clones reclone rather than merging old history.
6. Confirm ordinary branch protection was restored immediately after the final ref push. End the push freeze only after the remote-ref and deployment checks pass.
7. Retain the old checkout, temporary rewrite mirror, cutover evidence, and user-created archive until the user decides the rewrite has been stable long enough to remove temporary recovery material.

## Exit Criteria

- the user-confirmed 7z archive is recorded as complete
- one post-deployment episode succeeded using the TXT-only workflow
- the merged feature branch was removed locally and, if applicable, remotely
- ordinary master cleanup contains no tracked legacy JSON
- retained writable branch/tag history contains neither JSON path
- manifest-backed TXT validation passes before and after filtering
- CI prevents legacy JSON from being recommitted
- full Hugo validation and GitHub Pages pass
- the mirror input refs exactly matched the frozen snapshot, and every published ref equals its recorded post-rewrite SHA
- a fresh ordinary clone has the expected size reduction and no legacy JSON paths

## Stop Conditions

Stop before force-pushing if:

- local master has unpublished ordinary changes
- the TXT-only episode or deployment has not been accepted
- the feature branch still exists
- the user has not approved the cutover
- remote refs changed after recording their SHAs
- the disposable mirror refs or master tree do not match the frozen source snapshot
- the push freeze cannot be maintained
- signed commits or tags appear without an explicit rewrite decision
- the pre/post master tree SHA differs unexpectedly
- manifest facts, TXT hashes, or unrelated source changed unexpectedly
- functional, full-Hugo, or fresh-clone validation fails

## Rollback

Before publishing rewritten refs, abandon the disposable rewrite attempt and leave the ordinary checkout unchanged.

After publishing, prefer a forward fix. For every successfully updated ref, record the actual post-rewrite remote SHA. If a true rollback is necessary, use the recorded pre-rewrite ref SHA from a preserved old checkout or recovery copy, and lease the rollback against the recorded post-rewrite remote SHA after the user approves. Push only the affected ref. Never lease a rollback against the old SHA or omit the lease. That rollback intentionally restores the large JSON history.

Use the user-confirmed 7z archive only if the old refs cannot otherwise be recovered. Do not inspect, restore, or delete that archive automatically.
