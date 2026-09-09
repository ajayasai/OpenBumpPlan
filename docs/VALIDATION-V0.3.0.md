# OpenBumpPlan v0.3.0 validation

## Executed locally

- **562 Node tests**, zero failures. This includes 120 sparse-matching cases checked against an independent exhaustive oracle, coupled proofs versus small exhaustive search, proof tampering, Hall witnesses, resource limits, locked signals, finite-width copper collisions, conservative routing, CLI exits, review tampering and trusted-key signatures.
- **31 Chromium scenarios**: 12 retained planning workflows, 11 earlier Engineering workflows, 8 new certified/copper workflows. Shipped standalone HTML, actual Web Workers, exports and Node verification are exercised. No unexpected external HTTP design-data requests are permitted by the browser harness.
- Synthetic scale measurements include 64/256/1,024/4,096 sources and full proof replay. The 4,096-source case has 8,192 sites and 20,224 candidate edges, approximately 1.407 s median over three local runs. This is a favorable near-aligned sparse engine case, not industrial interactive qualification.
- Fixed routing seeds 1–100: old sequential router completes 71; negotiated routing completes 88; 17 recovered, zero complete-to-incomplete regressions. Routing completion is grid-checked, not electrically qualified. More effort/length can be required.
- A 24-movable-source coupled case exceeds the old exact-search size cap and passes its checked coupled proof.
- Continuous checks reject grid-valid geometries with too-wide traces, oversized vias, pad overlap and keepout encroachment. Budget exhaustion and unknown outcomes never produce a false all-clear.

`docs/qualification-v0.3.0.json` contains per-case data, environment, input hashes, ceilings and reproducible protocol. `scripts/qualify-v03.mjs` recreates it. Timings vary with host load.

## Native browser qualification

The managed local Chromium explicitly returns `ERR_BLOCKED_BY_ADMINISTRATOR` for localhost navigation. No administrator policy was disabled. Local browser success therefore applies to `set_content` execution, not real-origin persistence. The GitHub publication/CI workflows execute the native localhost suites on a separate GitHub-hosted runner and retain their reports. A successful Actions record, not this paragraph, establishes that remote result.

## Remaining unperformed or unqualified work

No commercial tool comparison, industrial reference-design acceptance, foundry rule deck, complete native-format round trip, SI/PI/thermal/mechanical signoff, independent security audit, multi-user authorization test, Firefox/Safari qualification, Windows/macOS manual workflow test, or large-scale interactive latency study. Abstract routing widths/pads/vias are not full manufacturing DRC. Worst-case coupled search remains exponential. The source graph, rule engine and coordinate transforms are shared trusted components; separate verifiers are not wholly independent EDA implementations.

## Reproduction

```sh
npm test
npm run build
npm run qualify:v03
python tests/browser_test.py --chromium /path/to/chromium
python tests/engineering_browser_test.py --chromium /path/to/chromium
python tests/browser_v03.py --chromium /path/to/chromium
python tests/engineering_browser_test.py --native --chromium /path/to/chromium
python tests/browser_v03.py --native --chromium /path/to/chromium
```

Native commands require an environment that permits normal localhost browser navigation. Review bundles are regenerated with this engine version; old version-bound evidence must not silently inherit new validation.
