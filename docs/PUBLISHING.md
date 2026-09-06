> For the existing repository and prepared v0.2.0 update, use [the guarded update workflow](PUBLICATION-V0.2.0.md). The older create-new-repository instructions below are historical and are not the upgrade command.

# Publish a new public repository

## Delivery status

No repository was created or uploaded in the delivery environment. The GitHub account was confirmed as `ajayasai`; the proposed `ajayasai/OpenBumpPlan` did not exist at the time of the check. The connected actions expose file/commit operations but not repository creation or visibility changes. GitHub CLI credentials are not included or requested in the package.

## Run locally

Install Node.js 22+, Git, and GitHub CLI. Extract this project into its own directory, not inside another Git repository. Review all files and remove any confidential designs you may have added.

```sh
cd OpenBumpPlan
gh auth login
npm run publish:github
```

The script `scripts/publish.mjs` verifies that `gh` is authenticated as **ajayasai**, checks the target, tests and builds the app, initializes a local `main` branch if needed, commits project files, and runs a create-public-and-push action. It only uses a local noreply commit identity if no Git identity is configured. It then reads back the repository URL and visibility.

Stop on errors and read the printed message. The script refuses an existing repository, a pre-existing `origin` remote, and a project nested within another Git repository. It does not overwrite, change visibility, force-push, or delete anything. A network interruption may leave a created repository without a complete push; inspect that state rather than repeatedly trying to recreate it.

Publication creates permanent public disclosure of committed material. The supplied examples are synthetic; future imports and reports may contain proprietary design information. Browser-local projects are not automatically copied into the source tree, but files saved into it can be included by Git.

## Optional public web demo

After the repository is created, enable GitHub Pages with **GitHub Actions** as its source in repository settings, then manually run **Deploy optional public demo** in Actions. The included workflow tests/builds and deploys only `dist/`.

This is a static site. The browser performs calculations; there is no design upload API. Opening a hosted site still makes normal page requests to the host; “local-only design data” does not mean anonymous hosting access. Do not publish a customized standalone build with embedded confidential demo data.

The included cloud workflows are templates whose syntax/content has been reviewed locally; no GitHub Actions or Pages run was completed in this environment. Action references use major-version tags. Organizations needing immutable supply-chain references should review and pin action commits before enabling their workflows.

## Local preview and containers

```sh
npm start
# Or explicitly expose only on the host loopback interface:
docker build -t openbumpplan .
docker run --rm -p 127.0.0.1:4173:4173 openbumpplan
```

The Dockerfile is provided but was not executed in the delivery environment. It uses a non-root Node process. No persistence or upload API is supplied. The local Node server was tested separately with HTTP requests; use export JSON for project backups.
