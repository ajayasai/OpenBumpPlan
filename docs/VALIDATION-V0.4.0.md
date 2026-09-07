# Validation of OpenBumpPlan 0.4.0

This document describes local evidence. It does not assert that an unobserved GitHub workflow passed, and it does not establish commercial-tool superiority.

## Completed local checks

- 868 Node tests pass with no failures or skipped tests on both Node 22.16.0 and Node 24.11.1. One test invokes the separate 21-test Python standard-library archive security suite.
- 80 randomized old/new A* path and diagnostic comparisons pass. Contact regressions reproduce the earlier tiny-clearance false pass and reject it with the new checker.
- Actual generation of 4,096 synthetic routes passes independent grid/copper checking, expected-project and expected-technology review replay, and input-immutability checks.
- 35 standalone Chromium scenario executions pass: 12 planning, 11 engineering, 8 proof/copper, and 4 new routing/freshness/grid-window scenarios. They exercise the built HTML, real workers, downloads and independent CLI replay.
- Native-localhost execution was attempted but `ERR_BLOCKED_BY_ADMINISTRATOR` prevents navigation in this environment. Those attempts are retained as blocked, not counted as passed, and the restriction was not bypassed.

The separate release qualification log records Node 24 execution and a clean extraction, rebuild, manifest verification and test of the actual exported ZIP. Consult those logs for results; they are not replaced by working-directory tests. GitHub status and a remote ZIP hash, when available, are recorded in a separate publication receipt after the run completes.

## Benchmarks

`docs/qualification-routing-v0.4.0.json` retains five alternating-order samples after warm-up, environment metadata, input hashes, frozen-oracle source hashes, exact operation boundaries, successful complete-work comparisons and larger capacity results. The 4,096-route median is approximately 1.348 seconds locally for generation plus grid/copper checks. Bundle creation/replay is outside that timer. The favorable fixture is explicitly bounded to a 512 by 512 single-layer grid; it is not industrial signoff or a real-congestion benchmark.

## Reproduction

```sh
npm test
python3 -m unittest discover -s tests -p safe_overlay_test.py -v
npm run build
npm run qualify:routing -- /tmp/routing-qualification.json
npm run qualify:copper -- /tmp/copper-qualification.json
npm run verify:release
python3 scripts/package-release.py --output /tmp/OpenBumpPlan-0.4.0-source.zip
python3 tests/browser_v04.py --chromium /path/to/chromium --output-dir /tmp/browser
python3 tests/browser_v04.py --native --chromium /path/to/chromium --output-dir /tmp/browser-native
```

Normal verification must never regenerate a manifest merely to make a mismatch pass. `--prepare` is a deliberate maintainer operation for a new release record. Historical validation files and manifests remain historical and are not rewritten by the new qualification.
