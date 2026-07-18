# GitHub Handling Notes

This guide records the GitHub-side setup for the Hugo compatibility site. It is separate from the main README because these steps are mostly repository settings and Actions UI handling, not local transcript or Hugo development.

## Current Deployment Shape

- The Hugo site lives under `site/`.
- The workflow file is `.github/workflows/pages.yml`.
- The workflow generates Hugo question mirrors and search data from the canonical `docs/questions/` sources, then builds Hugo output from `site/`.
- GitHub Pages deploys the uploaded Pages artifact.
- The Pages source setting should be `GitHub Actions`.
- The active Pages environment is named `github-pages`.
- Pushes to `master` run the workflow automatically. `workflow_dispatch` can run it manually from another selected branch.

The GitHub Pages URL for this repository is:

```text
https://r-jack-ray.github.io/ancient-egypt-and-the-bible/
```

## Local Versus GitHub Responsibilities

Local validation checks whether the generator and Hugo build work:

```powershell
pwsh -NoProfile -File scripts/Test-HugoSite.ps1
```

GitHub Actions checks whether GitHub can repeat that build and publish the artifact. A local pass does not guarantee deploy success, because GitHub repository settings can still block deployment.

## Pages Settings

In the repository UI:

```text
Settings -> Pages
```

Expected setting:

```text
Build and deployment -> Source -> GitHub Actions
```

Do not use the suggested Jekyll or Static HTML workflow cards for the Hugo migration. Those cards are generic GitHub templates and are not the current project workflow.

If this page says the site is live, Pages is enabled. That does not necessarily mean the latest Hugo workflow deployed successfully; it may be showing the last successful deployment from an older workflow.

## Environment Settings

GitHub Pages deployments run through the `github-pages` environment.

In the repository UI:

```text
Settings -> Environments -> github-pages
```

Check the deployment branch or tag policy. The current repository policy allows `master`. A workflow manually dispatched from a policy or feature branch can prove that the build job succeeds, but its deploy job may be blocked by the `github-pages` environment. That block is an environment-policy result, not a content-build failure.

## Running The Workflow

The workflow runs on:

- Pushes to `master`.
- Manual `workflow_dispatch` runs from the Actions UI on the selected branch.

Pushing a policy branch alone does not trigger this workflow. To validate one before merging:

1. Push the branch.
2. Open `Actions`.
3. Select `Build and deploy Hugo site`.
4. Select `Run workflow`, choose the policy branch, and start the run.
5. Require the build job to pass. A deployment blocked only because the branch is not permitted by the environment does not invalidate the build result.

To rerun after a settings fix:

1. Open the failed workflow run.
2. Click `Re-run jobs`.

If the build job passed and only the deploy job failed, rerunning after the environment policy fix is usually enough.

## Common Failure Messages

### Branch Not Allowed To Deploy

Message:

```text
Branch "some-feature-branch" is not allowed to deploy to github-pages due to environment protection rules.
```

Meaning:

- The Hugo build finished.
- The Pages artifact was created.
- GitHub blocked the deploy because the `github-pages` environment does not allow this branch.

Fix:

```text
Settings -> Environments -> github-pages
```

If a feature-branch deployment is intentionally required, allow that exact branch temporarily and rerun the failed workflow job. Otherwise, keep the `master`-only policy and merge the validated change normally so the automatic `master` workflow can deploy it.

### Hugo Is Not Installed Locally

Message:

```text
Hugo is not installed or not on PATH.
```

Meaning:

- Local PowerShell could run the content generation checks.
- Full local Hugo rendering could not run.

Fix:

Install Hugo Extended locally and open a new terminal:

```powershell
winget install Hugo.Hugo.Extended
hugo version
pwsh -NoProfile -File scripts/Test-HugoSite.ps1
```

GitHub Actions installs Hugo inside the runner, so this local error does not automatically mean the GitHub workflow will fail.

### Build Passes, Deploy Fails

Meaning:

- The code and Hugo output are probably valid.
- The remaining problem is usually GitHub Pages settings, environment restrictions, or repository permissions.

First checks:

- `Settings -> Pages` uses `GitHub Actions`.
- `Settings -> Environments -> github-pages` allows the branch.
- The workflow has `pages: write` and `id-token: write` permissions.

## Merge-Time Preference

The durable deployment path is the automatic `master` workflow. Keep `workflow_dispatch` for controlled branch validation, and remove any temporary feature-branch deployment allowance after the test. Generated question mirrors are build products: GitHub Actions must recreate them from `docs/questions/`, and they must not be committed to the policy branch or `master`.
