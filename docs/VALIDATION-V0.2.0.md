# OpenBumpPlan v0.2.0 — validation record

Prepared and locally tested on 5 September 2026. This document describes observed results, not an industrial or commercial qualification. The prepared upgrade has **not been pushed to GitHub** from this session.

## Results

| Check | Observed result | Evidence |
|---|---|---|
| Node regression/unit/property/integration suite | **376 passed, 0 failed, 0 skipped** on Node 22.16.0/Linux | `node-tests-v0.2.0.tap` |
| Original planning browser workflows | **12 passed, 0 failed** | `planning-browser-v0.2.0.json` |
| New Engineering browser workflows | **11 passed, 0 failed** | `engineering-browser-v0.2.0.json` |
| Exact-vs-heuristic fixed-seed corpus | **40/40 exact searches completed; 3 improvements, 37 ties, 0 losses** | `qualification-v0.2.0.json` |
| Constructed pair-first feasibility bottleneck | Previous heuristic: 4 hard errors; exact search: **optimal in stated scope, 0 hard errors, objective 300** | `examples/pair-bottleneck*.json` |
| Layered crossing witness | **2 routes, 120 µm planar length, 2 vias; independent checker passed** | `examples/verified-routes.json` |
| Bound review payload | Independent rule/witness verification passed; browser-produced bundle also verified through Node CLI | Evidence/browser tests and `examples/verified-review-bundle.json` |
| Standalone build | **222,103 bytes**, reproducible current build | `dist/SHA256SUMS` |

Standalone SHA-256:

```text
6cbb526c0ba51dc98207592059bf1efdd9043a791f842b935cb7cb82ca50b478
```

## What the tests exercise

The original 151 tests remain, with added solver, routing, evidence, hashing, CLI, and publication-manifest tests. Solver cases include independent brute-force enumeration, coupled pair constraints, locked mappings/inherited signals, necessary-condition Hall witnesses, time/node limits, invalid options, and engineering-change penalties/budgets. Routing tests include an independent BFS oracle on bounded grids, obstacles between nodes, multiple layers, clearance, reserved sites, incomplete routing, stale input, and deliberately corrupted witnesses.

Evidence tests change payloads, hashes, pass flags, metrics, expected designs, engine versions, signatures, and signing keys. Rehashing fabricated stored findings still fails their independent recomputation. Ed25519 signature checks use native Node crypto and an external trusted key. SHA-256 fallback tests compare padding boundaries, Unicode, and a million-byte input against Node/OpenSSL. These tests are not cryptographic certification.

CLI tests run the actual commands through subprocesses and check output files/exit codes. Temporary test keys are generated locally and deleted; no private key is in this release. Publication-manifest tests cover checksums, required files, wrong repository/base/version, path traversal, and source symlinks. The helper's remote authentication/clone/push/readback path was **not executed**.

The Chromium tests load the actual standalone HTML via Playwright `set_content`, without replacing the application, solver, worker, or verifier with stubs. They exercise real pointer editing, strict rollback, undo/redo, imports, exports, the exact-search worker, routing worker, cancellation, changed-design stale-result rejection, checked Apply, SHA-256 review downloads, and browser-to-CLI verification. Fresh browser contexts isolate scenarios. The local Chromium version was 144.0.7559.96. Actual screenshots are in `studio-screenshot.png` and `engineering-studio.png`.

## Quality comparison interpretation

Every seed from 1 through 40 is included; none is discarded for unfavorable quality. Each case has six sources and six targets, explicit synthetic coordinates, and a fixed crossing penalty. The baseline optimizer source is byte-identical to v0.1.0. Aggregate old/new objective is **26,848 / 26,708**. The detailed report records individual input hashes, objective values, node/leaf counts, completion, and observed local timing.

The pair bottleneck is a *constructed diagnostic*, not a randomly selected industrial design. It shows a specific weakness of pair-first greedy commitment: using scarce near targets for a differential pair prevents a restricted third signal from being assigned, whereas joint search can move the pair to the other adjacent targets. It should not be reported as a general commercial feasibility rate.

The two-route crossing is a small layered-grid witness, not a package routing benchmark. Vias are abstract layer transitions. No parasitics, current, return path, physical via geometry, or manufacturing data were used.

## Explicitly unverified

The managed browser rejected native localhost navigation with `net::ERR_BLOCKED_BY_ADMINISTRATOR`; no browser policies were disabled. Consequently native file/server navigation, true-origin persistence and browser reload recovery have **not been verified here**. The optional `--native` suite and prepared CI configuration add those checks for an ordinary workstation/runner, but a configuration file is not a passing run.

Also unverified: the Node 24 CI matrix, new remote GitHub CI, remote publish helper, GitHub Pages, other browser engines, comprehensive accessibility, hostile multi-user hosting, security audit, industrial data/scale, full vendor-format round trips, and comparisons against licensed commercial products. A prior v0.1.0 GitHub CI success does **not** establish v0.2.0 remote CI success.

## Reproduce

```sh
npm test
npm run build
npm run qualify
python tests/browser_test.py --chromium /path/to/chromium
python tests/engineering_browser_test.py --chromium /path/to/chromium
node scripts/cli.mjs verify-routes examples/routing-laboratory.json examples/verified-routes.json
node scripts/cli.mjs verify-bundle examples/verified-review-bundle.json --project examples/routing-laboratory.json
```

The project itself has no npm dependencies; browser test tooling requires Python Playwright and Chromium. `qualify` overwrites generated synthetic evidence with a new measured run; elapsed-time metadata can change witness/bundle digests even when designs and objective results are identical. The browser scripts write fresh result JSON/screenshots. Keep historical and newly generated records distinct. The original `VALIDATION.md`, original browser report, and old benchmark records are explicitly historical v0.1.0 material.
