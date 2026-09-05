# Engineering workbench — v0.2.0

The workbench adds a small-instance exact assignment oracle, engineering-change budgets, multilayer grid routing, and revision-bound computation evidence. These are usable implementations, not commercial-parity claims. Existing project JSON remains schema version 1; routing configuration and computation results are explicit sidecar documents.

## Exact assignment: what is guaranteed

`solveExactStage(project, from, to, options)` considers all eligible, unlocked, named sources in one allowed forward stage and requires each to receive exactly one distinct eligible target. Source/target IDs are recorded in the result. Sites, die transforms, other-stage edges, existing edge metadata, and locked mappings are not changed. Sources with an outgoing connection to another stage are outside the movable scope. This is an exact oracle for the declared stage domain, not simultaneous multi-stage optimization, route-aware optimization, or an industrial-scale solver.

The objective is:

```
all-project physical Manhattan length
+ crossingWeight * all-project same-stage ratsnest crossings
+ changePenalty * number of changed selected-stage assignments
```

An added assignment counts as a change. `maxChanges` is a hard upper bound on changed assignments; `changePenalty` trades geometric score against disruption. A full candidate must pass every configured hard rule in the entire project. Warnings remain permitted, and are visible in `analysis`; the crossing budget is a warning in the existing model, not a hard routing constraint. Other stages' inherited signal identities may change through the existing propagation model even though their edge endpoints are fixed. Explicit edge net identities remain enforced.

The branch-and-bound lower bound is a minimum-cost injective assignment for remaining sources plus fixed-edge Manhattan lengths, already chosen costs, and change penalties. Coupled ground/pair/domain/path rules and all nonnegative crossing penalties are relaxed in this bound. This is a lower bound because the relaxed domain contains every feasible completion. Leaves are evaluated with the full rule engine. All unvisited branch bounds remain accounted for when a node budget is reached. Search is deterministic and uses binary64 arithmetic with an absolute score tolerance of `1e-7`; it is not an exact-rational proof.

Statuses have deliberately different meanings:

| Status | Meaning |
|---|---|
| `optimal` | A fully checked feasible candidate exists and the remaining search cannot improve it beyond the stated tolerance. |
| `feasible` | A checked candidate exists, but the open search still permits improvement. Read lower/upper bounds and the gap. |
| `infeasible` | The declared domain was exhausted with no feasible candidate, or a valid Hall-deficient compatibility set proves capacity infeasibility. |
| `unknown` | Search/analysis was incomplete and no checked feasible candidate was established. **Not infeasible.** |
| `no-op` | There are no movable named sources. **Not an optimality certificate.** |

A Hall witness identifies a source set whose union of compatible targets is smaller than the source set, with the actual IDs and deficit. Coupled-rule infeasibility reports rejected leaf counts by rule; those counts are diagnostics, **not a minimal unsatisfiable core**. An incomplete geometry check never certifies a candidate.

Defaults: 12 movable sources, 24 targets, 20,000 search nodes. Explicit API caps: 16 sources, 64 targets, 200,000 nodes, and a 2,000-site/connection project. Caps are checked before allocating the assignment cost matrix. Lock unrelated mappings or extract a small validation problem; use the original heuristic for larger stages. Limits are safety boundaries, not throughput guarantees.

## Multilayer route feasibility

`routeStage(project, from, to, config)` routes existing stage links without changing mapping or geometry. It uses deterministic A* on an explicit orthogonal grid with adjacent-layer vias and a bounded set of routing-order retries. Each route's terminals are fixed at their exact project-world coordinates. Off-grid/out-of-window endpoints are rejected, **never silently snapped**. The supplied grid window bounds permitted centerlines; it is not a substrate outline or copper edge-clearance model.

Routing layers are integer indices, not pad/bump/interposer/ball/PCB kinds. Start and end layer indices are explicitly configured for the selected stage. All traces and via lands use a uniform width model; vertical physical via length is not known. Via cost is an optimization penalty in equivalent length units, not a delay or extracted resistance.

Rectangular routing obstacles are explicit and can apply to selected layers. The router checks whole grid edges against obstacles expanded by half trace width plus clearance, so even obstacles narrower than a grid step cannot be tunneled through. Same-layer occupied nodes and other connections' terminals receive a **conservative square halo** of `ceil((traceWidth + clearance) / pitch)` grid steps. This may reject geometrically legal routes and is one reason a routing failure is not an infeasibility proof. Even routes sharing a logical net remain disjoint; physical fanout/padstack merging is not modeled.

**Site keep-outs are not silently promoted into routing obstacles.** They describe occupied endpoint restrictions in the original model, not a routing stack. Add routing obstacles explicitly in the sidecar configuration. The workbench shows both model findings and routed-geometry findings.

`checkRoutes` validates submitted geometry independently of A*: exact endpoints and routing layers, unit rectilinear steps/adjacent-layer vias, obstacle/width/clearance intersection, cross-route Euclidean centerline clearance, route coverage, planar maximum lengths, and configured differential-pair planar skew. Its comparison budget includes same-route candidate pairs so pathological paths cannot evade the budget. Missing, malformed, truncated, or budget-exhausted checks cannot pass. Successful route geometry is not sufficient for `status: routed` if the input project has hard rule errors.

Defaults/caps: up to 512 stage links, 250,000 grid cells, 128 rectangular obstacles, 1–8 layers, 1–4 order attempts, and 200,000 default / 2,000,000 maximum A* expansions. Supplied route reports are limited to 250,000 total points. Detailed routing, negotiated congestion, padstack-aware via sizing, differential-pair co-routing, impedance control, length tuning, package escape synthesis, and electrical/thermal signoff are absent.

## Reproducible evidence, not forged approvals

`createEvidence` uses platform Web Crypto SHA-256 on canonical JSON (sorted object keys, original array order) to bind the **full input document**, including revision and audit history, and the complete result. Nonfinite or non-JSON values are rejected. The envelope includes the engine version, algorithm/version, options, input digest, result digest, and envelope digest. No third-party service is contacted.

`verifyEvidence` checks those bindings and deterministically replays the declared bounded computation. Routing verification additionally checks supplied geometry independently of the path search. A fabricated result with newly recomputed hashes still fails when replay disagrees. The replay is performed by this implementation, not an independent formal proof checker; small-instance exhaustive-enumeration tests are a separate correctness oracle. Version mismatches fail explicitly instead of pretending a newer solver is identical.

Hashes are **not digital signatures**, approvals, trusted timestamps, encryption, or nonrepudiation. Someone who can edit both the input and envelope can create new valid evidence for a different design. Verification is meaningful only against the intended input and trusted source/version. Replay limits are caller-authorized; default limits reject a request for excessive computation.

`verify` exits 0 for a correctly reproduced result **even when that result is infeasible, unknown, or partial**. Its `planningPass` and `status` fields convey that distinction. A verification success is never manufacturing approval. `check-routes` checks supplied grid geometry only; use the normal `check` command for project-wide rules as well.

In a browser without Web Crypto, evidence export fails explicitly; there is no weak-hash fallback. Use localhost, HTTPS, a supported standalone-file browser, or Node 22+. Worker staleness rejection compares the complete canonical input, not the old 32-bit display identifier. Results require explicit application; project edits invalidate the displayed result. Original-input export makes old results reproducible without misrepresenting them as current.

## Reproduce the shipped challenges

```sh
npm test
npm run build
npm run benchmark:engineering
node scripts/cli.mjs exact examples/exact-challenge.json exact.json --from pad --to ball
node scripts/cli.mjs verify examples/exact-challenge.json exact.json
node scripts/cli.mjs route examples/routing-challenge.json routing.json --config examples/routing-config.json --svg routes.svg
node scripts/cli.mjs check-routes examples/routing-challenge.json routing.json
node scripts/cli.mjs verify examples/routing-challenge.json routing.json
```

The six-source solver challenge was selected after a seeded search (first improvement at seed 23). The old heuristic scores 4,450; the bounded exact oracle scores 2,850 with zero hard errors. A separate enumeration of **all 720 permutations** confirms 2,850. This selected example demonstrates a real local-minimum escape, **not average-case improvement or commercial superiority**. With the old heuristic result as input, budgets of 0 or 2 changed links preserve score 4,450; a budget of 4 permits the 2,850 solution.

The explicit wall blocks both connections on the one-layer routing fixture. Two layers yield two checked paths, four vias, and 1,200 um of planar wire. This demonstrates the routing model, not manufacturing viability. Raw results, evidence and runtime details are in `docs/engineering-benchmark.json` and the example evidence JSON files. Timing is one environment-dependent run, not a comparative speed benchmark.

## Acceptance gates and remaining commercial gaps

Unit tests include 36 seeded independent full-enumeration comparisons, lower-bound checks under search cutoffs, locks, ECO budgets, Hall sets, coupled-rule rejection, routing adversarial cases, forged/stale evidence, and CLI exit contracts. Browser workflows cover explicit apply/undo, stale result marking, multilayer rendering/SVG, worker errors, and Web Crypto availability. Separate real-origin tests cover reload persistence, browser-to-Node evidence replay, and standalone file loading; they fail rather than substituting an embedded-page fallback.

There is no licensed Cadence, Synopsys or Siemens head-to-head dataset/result in this repository. Primary vendor descriptions checked on 2026-09-05 establish a broader comparison scope:

- Cadence Integrity System Planner: cross-substrate connectivity optimization, ECO/native implementation interoperability and multiple interface formats. https://www.cadence.com/en_US/home/resources/datasheets/integrity-system-planner-ds.html
- Synopsys 3DIC Compiler: routing automation, integrated multiphysics analysis and signoff. https://www.synopsys.com/implementation-and-signoff/3dic-design.html
- Siemens Xpedition Substrate Integrator: heterogeneous assembly planning, custom pin/ball optimization, logical verification and implementation/signoff integration. https://resources.sw.siemens.com/sv-SE/fact-sheet-xpedition-substrate-integrator/

Native database round-trips, verified production design-rule decks, industry-scale route quality/runtime, padstack-aware routing, SI/PI/thermal/mechanical accuracy, and operational approvals/collaboration still require implementation and validation. Do not convert an open-source inspectability advantage or these synthetic regressions into a universal product ranking.
