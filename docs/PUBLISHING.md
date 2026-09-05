# Public repository, updates, and optional hosting

## Published source

The public repository is [ajayasai/OpenBumpPlan](https://github.com/ajayasai/OpenBumpPlan). Source, tests, standalone HTML, example reports, and the MIT license are committed on `main`. The initial repository commit is preserved; publication did not force-push or replace its history.

See [PUBLICATION.md](PUBLICATION.md) for the source-transfer checksum and GitHub validation run. The original archive delivery preceded repository creation; its previous publication blocker no longer applies.

## Run locally

Install Node.js 22 or newer and Git. No npm packages need to be installed.

```sh
git clone https://github.com/ajayasai/OpenBumpPlan.git
cd OpenBumpPlan
npm start
```

Open `http://127.0.0.1:4173`. Alternatively, use `dist/openbumpplan.html` as a standalone file. Export project JSON for durable backups.

## Update or contribute

```sh
git pull --ff-only
git switch -c my-planning-improvement
# Edit source and add regression tests.
npm test
npm run build
git add <reviewed-files>
git commit -m "Describe the improvement"
git push -u origin my-planning-improvement
```

Open a pull request for review. A contributor without write permission should fork first and use their fork as `origin`. Review every staged file: publication is public disclosure. The supplied examples are synthetic; imported customer projects and reports may be confidential.

The existing `npm run publish:github` script is retained as a historical helper for creating a new repository. It deliberately refuses an existing `ajayasai/OpenBumpPlan` or `origin` remote. Do not use it to update this published repository.

## Optional public web demo

In repository **Settings → Pages**, choose **GitHub Actions** as the build/deployment source, then manually run **Deploy optional public demo** under Actions. The workflow tests/builds and deploys only `dist/`. Pages hosting is optional and is not enabled merely by committing these files.

This is a static application: browser calculations require no design upload API. A hosted site still makes normal page requests to its host. Do not publish a customized standalone build containing confidential demo data.

GitHub Actions references use major-version tags. Organizations requiring immutable supply-chain references should review and pin action commits. The initial publication workflow was completed and removed after transferring the verified files; ongoing CI uses the read-only planning-engine workflow.

## Containers

```sh
docker build -t openbumpplan .
docker run --rm -p 127.0.0.1:4173:4173 openbumpplan
```

The Dockerfile is provided but has not been executed in this delivery environment. It uses a non-root Node process. No persistence or upload API is supplied.
