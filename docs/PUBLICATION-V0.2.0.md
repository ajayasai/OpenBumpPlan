# v0.2.0 publication status and safe update

**Prepared locally; not pushed from this session.** The connected repository was read and confirmed as public `ajayasai/OpenBumpPlan` on `main` at `7e87673bd63b601045c1d5a50e5448051ec759ef`. Current connector discovery exposes read-only repository actions; the previous turn's write actions are not available now. The prepared package must not be confused with a completed GitHub release, tag, deployment, or CI result.

The original v0.1.0 public commit is preserved. The update archive contains the complete usable app and an explicit `.release/update-manifest.json` of files to copy onto that reviewed base. Unlisted remote files, including historical publication records, are preserved.

## Publish from the extracted upgrade archive

Install Git, GitHub CLI and Node.js 22+ on your workstation. Authenticate GitHub CLI as `ajayasai` (and allow Git authentication during setup):

```sh
gh auth login
npm run verify:release
npm run publish:update
```

The helper checks local file bytes against SHA-256, verifies account/repository visibility, clones the existing repository into a temporary directory, checks the exact base commit, copies only manifest-listed files, reruns the full Node suite/build, checks rebuilt bytes, creates a normal commit, and fast-forward pushes. It reads back the commit and public visibility. There is **no force push, repository creation, or visibility change**. A concurrent update is rejected by the base check or normal Git push.

A wrong account, absent CLI/Git credentials, changed repository base, malformed manifest, checksum mismatch, source/destination symlink, build/test failure, or rejected push stops the operation. If a push succeeds but later readback fails, the helper explicitly says the remote may have changed; it does not claim rollback. The prepared source directory remains unchanged. The temporary checkout is removed afterward.

The manifest is an integrity record, not an external publisher signature: obtain it and the source from a trusted origin and review changes. No secret is required in chat or embedded in source. Do not put proprietary design files in the publication overlay.

The local manifest-validation branch is tested. Actual remote execution remains unverified until run with an authenticated publishing CLI. After push, review the new GitHub Actions jobs; they include the Node matrix and native browser tests. Do not reuse the prior release's CI badge as evidence for this upgrade.
