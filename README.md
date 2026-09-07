# OpenBumpPlan

**Open-source bump planning with replayable optimization proofs and independently checked routing geometry.**

Local-first planning for **IC pads → microbumps → interposer sites → package balls → PCB sites**. Edit, constrain, optimize, review and export without uploading design data.

**v0.3.1 · MIT license · engineering alpha.** This release retains scalable certified assignments, hard-constraint search with proof replay, congestion-repair routing and continuous finite-width copper checks. It is **not** a qualified foundry, electrical or thermal signoff tool, and superiority over commercial EDA products has **not** been demonstrated.

## New in v0.3.1: scalable continuous copper verification

The independent copper checker now uses a conservative two-dimensional bounding-volume index before its unchanged capsule/disc distance calculation. Widths, clearances, keep-outs, layer checks and acceptance tolerances are **not relaxed**. A separate bounded spatial-work counter prevents pathological index traversal from receiving an all-clear result.

Five measured local runs on constructed, separated L-route fixtures:

| Routes / sites | Preceding verifier | v0.3.1 | Interpretation |
|---|---|---|---|
| 64 / 128 | 7.418 ms median | 6.217 ms median | 1.19x; both complete |
| 256 / 512 | 29.850 ms median | 28.643 ms median | 1.04x; both complete |
| 512 / 1,024 | 133.533 ms median | 44.413 ms median | 3.01x; both complete |
| 512 / 8,192 | Incomplete at 2,000,001 comparisons | Complete; 344.309 ms median | Full grid and review replay also pass |
| 4,096 / 8,192 | Incomplete | Complete; 546.007 ms median | **Supplied-witness copper-only**, not router capacity |

These are synthetic comparisons with the frozen preceding OpenBumpPlan checker, not commercial tools. The large incomplete runs are **not speedup comparisons**; the new version may take longer because it finishes the work. The router and grid witness checker still support at most **512 assignments**. Raw samples, input hashes, work counts and exact protocol: [copper qualification](docs/qualification-copper-v0.3.1.json). [Algorithm and release notes](docs/V0.3.1.md).

## Run

Use Node.js 22 or newer. No npm installation or runtime dependencies:

```sh
git clone https://github.com/ajayasai/OpenBumpPlan.git
cd OpenBumpPlan
npm start
```

Open **http://127.0.0.1:4173**. `dist/openbumpplan.html` also bundles the app, styles and workers into one offline file. File-origin browser policies may restrict workers/storage; the local server is the preferred fallback. Export JSON for durable backups. `private: true` in `package.json` prevents accidental npm publication; the GitHub repository is public.

**v0.3.1 validation:** 741 Node tests and 31 standalone Chromium scenarios pass locally; the extracted source package rebuilds and passes all 741 tests again. Local native-origin navigation was blocked by administrator policy, not bypassed. [Exact validation scope](docs/VALIDATION-V0.3.1.md).

## What is materially different in v0.3

| Capability | Implemented behavior and boundary |
|---|---|
| Sparse certified assignment | Complete unary-compatible candidate graph, integer-cost minimum-cost flow, no nearest-k pruning. A separate checker verifies a complete matching and every residual reduced-cost inequality. |
| Coupled search beyond 12 sources | Best-first sparse assignment subproblems, hard-rule rechecks, disjoint prefix partitions, and replayable proofs. Handles more than 12 movable sources; worst-case search remains exponential and explicitly bounded. |
| Honest failure semantics | A stopped search is unknown or feasible-with-bound, never automatically infeasible or optimal. Valid Hall deficiencies explain some impossible scopes. Rejected mappings are not applied. |
| Congestion repair | Negotiated-congestion rip-up/reroute after initial A* route orders fail. Temporary search collisions are never accepted as final routing evidence. |
| Continuous copper validation | Round-capped trace widths, circular via/pad diameters, per-layer spacing and keepouts checked using continuous distances, separately from the grid rasterizer. Explicit technology inputs, not implied process signoff. |
| Review integrity | SHA-256 binds findings and routes; physical bundles also bind and recheck declared technology. The CLI accepts an independently expected technology file and trusted Ed25519 public key. |
| Real application integration | Cancellable workers, stale-result rejection, checked/undoable Apply, self-contained proof reports, routed SVGs, CLI commands and regression tests. |

The former 12-source permutation solver remains available for the **crossing-weighted objective** and explicit maximum-changes ECO limit. The new certified solvers minimize **rounded stage L1 + changed-target penalty**, not that crossing-weighted score. Do not compare the two objectives as if they were the same.

## Measured qualification, not vendor marketing

The preceding v0.3.0 qualification recorded **562 Node tests** and **31 Chromium scenarios**: 12 planning, 11 earlier Engineering, and 8 new proof/copper workflows. The publication workflow additionally runs native-origin browser tests on GitHub's runner; consult the actual Actions result for remote status.

On **100 fixed synthetic single-layer routing instances**, complete checked witnesses increased from **71 to 88**, recovering **17** cases with **zero complete-to-incomplete regressions**. Both algorithms had identical total expansion/time ceilings; negotiation can spend more work and is not claimed to be universally faster.

A favorable **4,096-source / 8,192-site** near-aligned grid with **20,224 candidate edges** solved and replay-verified in approximately **1.407 s median** over three local runs. This is an engine measurement—not interactive UI latency or a guarantee for difficult industrial constraints. A separate 24-movable-source example requires actual coupled constraint rejection and search, beyond the old permutation limit.

[Raw results and input hashes](docs/qualification-v0.3.0.json) · [Validation](docs/VALIDATION-V0.3.0.md) · [Algorithm semantics and proof boundaries](docs/V0.3.0.md)

## Try it

In **Engineering**, choose **Load constrained example → Solve with coupled certificate → Apply checked mapping**. The proof is exported with its original input project. Solving alone never mutates the project.

Choose **Load routing example → Route and check copper**. The displayed dimensions are **synthetic demonstration inputs**, not recommended manufacturing values. Export a route witness or a review bundle. Increasing widths beyond available spacing must produce a failure, not weakened rules.

## CLI

```sh
# Coupled integer L1/ECO optimization, with a separately replayable proof.
node scripts/cli.mjs solve-certified examples/pair-bottleneck.json solved.json --proof proof.json
node scripts/cli.mjs verify-coupled examples/pair-bottleneck.json proof.json

# Faster relaxation only: its candidate is rejected if coupled rules fail.
node scripts/cli.mjs solve-linear project.json solved.json --proof matching.json
node scripts/cli.mjs verify-assignment project.json matching.json

# Geometric routing with explicit, externally supplied technology assumptions.
node scripts/cli.mjs route-physical examples/routing-laboratory.json routes.json --pitch 10 --via-cost 10 --technology examples/copper-technology.json
node scripts/cli.mjs verify-copper examples/routing-laboratory.json routes.json --technology examples/copper-technology.json

# Bind review, geometry and technology; optionally authenticate with a trusted key.
node scripts/cli.mjs bundle examples/routing-laboratory.json review.json --routes routes.json
node scripts/cli.mjs verify-bundle review.json --project examples/routing-laboratory.json --technology examples/copper-technology.json
node scripts/cli.mjs sign-bundle review.json signed.json --key /secure/reviewer-private.pem
node scripts/cli.mjs verify-bundle signed.json --public-key /trusted/reviewer-public.pem --technology examples/copper-technology.json

# Existing import/export, checks, revision and ECO workflows remain.
node scripts/cli.mjs check examples/chiplet-demo.json
node scripts/cli.mjs solve project.json eco.json --sources P1,P2 --max-changes 1 --change-penalty 100
node scripts/cli.mjs route project.json routes.json --pitch 10 --negotiate
node scripts/cli.mjs export solved.json interface.pdf
```

Proof verification requires the **original pre-optimization project**: it determines candidate eligibility, locks and change penalties. Mathematical certificate validity does not authenticate its producer. `verify-assignment` checks the relaxed graph; `verify-coupled` also replays the configured hard constraints. A signature without a caller-supplied trusted key is not trusted.

Exit 0: the requested operation/check succeeded; 1: no passing candidate or a failed gate; 2: invalid input/usage. Routing writes partial diagnostics with a failing exit code; never mistake their existence for a passed design.

## Reproduce

```sh
npm test
npm run build
npm run qualify:v03
npm run qualify:copper
npm run verify:release
python tests/browser_test.py --chromium /path/to/chromium
python tests/engineering_browser_test.py --chromium /path/to/chromium
python tests/browser_v03.py --chromium /path/to/chromium
python tests/engineering_browser_test.py --native --chromium /path/to/chromium
python tests/browser_v03.py --native --chromium /path/to/chromium
```

Python Playwright is a test-only dependency. Managed browsers that forbid localhost navigation cannot execute native mode; do not disable their administrator policy. CI runs the native modes on its own runner.

## Retained capabilities and important gaps

CSV/JSON import with explicit unit conversion; limited LEF MACRO/PIN/PORT RECT import; five-stage connectivity; die transforms; drag/reassign, locks and undo/redo; domain/pair/ground-neighbour/region rules; revision differences; SVG/PDF/JSON/CSV and interface-control exports.

JSON is authoritative. Full LEF/DEF/GDS/ODB++/IPC-2581/native-vendor round trips, route-dependent assignment co-optimization, electrically verified shielding, IR-drop/electromigration, SI/PI/thermal/mechanical signoff, foundry certification, multi-user authorization, and industrial design qualification remain unimplemented or unqualified. [Competitive evidence](docs/COMPETITIVE-EVIDENCE-V0.3.0.md) distinguishes shipped features from these gaps.

See [MIT license](LICENSE), [security](SECURITY.md), [contributing](CONTRIBUTING.md), and [format](docs/FORMAT.md). The guarded publisher is a maintainer utility for this prepared base-commit overlay, not needed to run a clone. It publishes a review branch, never directly changes main, and requires the expected base commit. [Recovery of the blocked staged release](docs/RELEASE-RECOVERY.md).
