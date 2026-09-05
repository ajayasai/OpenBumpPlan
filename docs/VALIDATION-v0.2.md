# Validation record — v0.2.0

## Reproduction commands

```sh
npm test
npm run build
npm run benchmark:engineering
python tests/browser_test.py --chromium /path/to/chromium
# With npm start already running:
python tests/browser_test.py --chromium /path/to/chromium --url http://127.0.0.1:4173/
python tests/browser_test.py --chromium /path/to/chromium --url http://127.0.0.1:4173/dist/openbumpplan.html
python tests/browser_origin.py --chromium /path/to/chromium
```

There are 240 engine/CLI tests, including the original 151. New tests cover exact search against 36 seeded independent permutation enumerations, open lower bounds, coupled infeasibility, Hall sets, locked mappings, ECO change budgets, grid routing/independent geometry checking, forged/stale evidence and command exit behavior. The frozen selected six-source challenge additionally enumerates all 720 permutations in `scripts/engineering-benchmark.mjs`.

There are 17 full browser workflow scenarios: the original 12 plus exact solve/review/apply/undo, routing and SVG output, failed worker input without mutation, stale-result invalidation, and Web Crypto behavior. The same harness accepts an actual HTTP URL to test native modules and HTTP-served standalone loading instead of substituting embedded HTML.

Five additional native-origin checks cover exact project restoration after reload and browser-to-Node evidence verification for **both** module and standalone HTTP entrypoints, plus actual local-file startup/worker optimization. These checks fail if navigation is blocked; there is no fallback to an embedded page.

## Actual evidence locations

The development environment passed all 240 Node tests and 17 embedded-page browser scenarios. It blocks localhost/file navigation by browser policy, so native browser checks must be established by the repository CI, not inferred from local runs.

A successful CI run produces these files/artifacts:

- `docs/node-test-results-v0.2.tap`: complete Node test output.
- `docs/browser-native-v0.2.json`: 17 scenarios through the native module entrypoint.
- `docs/browser-standalone-v0.2.json`: 17 scenarios through HTTP-served standalone HTML.
- `docs/browser-origin-results.json`: five native origin/file checks.
- `docs/engineering-benchmark.json`: selected-fixture objective, exhaustive reference, route results and environment/timing.
- `examples/exact-evidence.json` and `examples/routing-evidence.json`: replayable computation records.
- `dist/SHA256SUMS`: hashes of the deterministic standalone builds.

Consult the actual workflow conclusion and reports, not this list of output paths, to determine which checks completed. A failed or pending workflow does not establish native-browser validation.

## Scope not validated

No foundry/manufacturing qualification, proprietary native-file interoperability, licensed commercial head-to-head comparisons, full-layout extraction, SI/PI/thermal/mechanical accuracy, complete accessibility audit, non-Chromium browser qualification, or industrial-scale interactive/routing throughput has been established. The exact challenge is intentionally selected and small; the grid routing challenge is synthetic and conservative. Runtime samples are not statistical commercial benchmarks.
