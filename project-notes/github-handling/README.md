# GitHub Handling Notes

This guide records the GitHub-side setup for the Hugo compatibility site. It is separate from the main README because these steps are mostly repository settings and Actions UI handling, not local transcript or Hugo development.

## Current Deployment Shape

- The Hugo site lives under `site/`.
- The workflow file is `.github/workflows/pages.yml`.
- The workflow builds Hugo output from `site/`.
- GitHub Pages deploys the uploaded Pages artifact.
- The Pages source setting should be `GitHub Actions`.
- The active Pages environment is named `github-pages`.

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

Check the deployment branch or tag policy. If the workflow runs from a feature branch, that branch must be allowed to deploy to the `github-pages` environment.

During the Hugo compatibility branch work, the branch is:

```text
codex/hugo-compatibility-site
```

If deployment from that branch is blocked, either allow that exact branch temporarily or merge the workflow to the branch that is already allowed to deploy.

## Running The Workflow

The workflow currently runs on:

- Pushes to `codex/hugo-compatibility-site`.
- Manual `workflow_dispatch` runs from the Actions UI.

To trigger it from GitHub:

1. Push the branch.
2. Open `Actions`.
3. Select `Build and deploy Hugo site`.
4. Use the latest run, or use `Run workflow` if GitHub shows the manual trigger.

To rerun after a settings fix:

1. Open the failed workflow run.
2. Click `Re-run jobs`.

If the build job passed and only the deploy job failed, rerunning after the environment policy fix is usually enough.

## Common Failure Messages

### Branch Not Allowed To Deploy

Message:

```text
Branch "codex/hugo-compatibility-site" is not allowed to deploy to github-pages due to environment protection rules.
```

Meaning:

- The Hugo build finished.
- The Pages artifact was created.
- GitHub blocked the deploy because the `github-pages` environment does not allow this branch.

Fix:

```text
Settings -> Environments -> github-pages
```

Allow the branch that ran the workflow, then rerun the failed workflow job.

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

The feature branch can prove the build, but the long-term Pages deployment should normally run from the repository's main publishing branch. Before merging the Hugo migration, decide whether the workflow should:

- Deploy only from the main branch.
- Keep manual `workflow_dispatch` for controlled test runs.
- Keep or remove feature-branch deployment permissions.

Once the migration is merged, remove temporary feature-branch allowances from the `github-pages` environment if they are no longer needed.
