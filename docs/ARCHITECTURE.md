# Architecture

## Dependency-free core, two callers

```text
Browser UI / Blob Web Worker         Node CLI / tests / benchmarks
                 \                   /
                  canonical core model
                 geometry + rule analysis
                optimization + revision gate
               importers + vector/report exports
```

`src/core/model.js` owns schema normalization, type and reference checks, transforms, effective signal propagation, and connection operations. `geometry.js` implements L1/Euclidean helpers, intersection predicates, a bounding-box sweep, spatial indexing, and shared work budgeting. `rules.js` composes these into findings, metrics, and an explicit completeness flag.

`optimizer.js` uses a Hungarian solver for the rectangular linear assignment subproblem. Differential pairs receive joint candidate placement; locked endpoints and edges remain fixed. Full-rule analysis guards proposed results and local swaps. The baseline project is never mutated. There is no claim that greedy pair placement plus local refinement finds the globally best feasible mapping. Failure to find a candidate is not an infeasibility certificate.

`revisions.js` implements atomic clone/check/commit transactions, up to 50 undo snapshots, redo, and up to 200 local audit records. It also compares structure and propagated net/physical effects. Review IDs use noncryptographic FNV-1a over canonicalized content; they are labels, not signatures. v0.2.0 adds separate SHA-256/Ed25519 evidence in evidence.js and scripts/signing.mjs; short FNV labels are never used as signature or stale-worker authority.

`importers.js` checks units and formats before model normalization. Imports are previewed with analysis and applied explicitly. `exporters.js` escapes HTML/XML, supports reversible spreadsheet-safe CSV, generates inspectable SVG/HTML/Markdown, and writes a compact ASCII-transliterated vector/text PDF without font dependencies.

## Browser

`src/app.js` is a DOM/SVG application using delegated controls. It implements planning/review workspace tabs plus Engineering and a local import dialog, inspector, rule editor, mapping operations, array generator, and exports. Site movement is one undoable transaction on pointer release. A worker performs optimization so the main thread can accept cancellation and other edits; full canonical content checks discard stale results.

Ordinary UI rule analysis is synchronous. Large or dense projects can pause the UI despite the geometry budget. DOM/SVG rendering is not virtualized beyond table/issue pagination and suppressed labels on larger maps. This release therefore does not promise responsive interaction at its maximum schema size.

The standalone build bundles modules into closures, embeds CSS, and embeds the worker source as a Blob. It does not use eval or fetch external dependencies. A restrictive CSP disables outgoing connect requests. Browser localStorage holds one active project when available; failure is surfaced and JSON export remains available. Session baselines and undo stacks are not durable backups.

## CLI and local server

The same core drives checks, optimization, diffing, and reports. No HTTP API is required. The optional server serves allowlisted static extensions using GET/HEAD, rejects dotfile/escaping/symlink paths, defaults to loopback, and offers no writes. It is not a production multi-user server or an authentication layer.

## Practical resource boundaries

The schema caps 10,000 sites, 20,000 links, 1,000 dies, 1,000 keep-outs, and 1,000 quota regions. Each text import is capped at 5 MiB. Geometry analysis has a configurable 100–10,000,000 comparison budget and at most 5,000 retained findings. Truncation and budget exhaustion are explicit and cannot produce a clean readiness verdict.

The optimizer defaults to at most 256 source and 512 target sites per stage (configurable within 512/1,024 safety limits) and a bounded number of swap trials. The browser uses 700 swap trials, the CLI default uses 1,500, and the recorded synthetic benchmark uses 100. These are limits, not capacity guarantees.

## Extension design

Keep the canonical interchange format independent of vendor databases. Add adapters outside the model, with round-trip fixtures and unit/orientation provenance. Route-aware checks should consume actual paths and stack layers, not reinterpret the existing ratsnest metric. Electrical solvers should produce separately named findings and provenance. The v0.2.0 coupled solver distinguishes scoped optimality, feasibility with a bound, timeout/unknown, and scoped infeasibility; it validates candidates with the ordinary rule engine.

## v0.2.0 modules

`solver.js` implements small-window coupled search, ECO limits, a Hungarian lower bound, and necessary-condition Hall witnesses. `routing.js` owns the conservative layered grid, bounded A* search, a separate witness checker, and SVG route visualization. `evidence.js` binds complete project/findings/witness payloads with SHA-256 and reruns checks during verification; `hash.js` provides a bounded offline hashing fallback. `scripts/signing.mjs` alone handles Ed25519 through native Node crypto. No private key or signing API is added to the browser.

The Engineering workspace dispatches tagged exact/route jobs through the existing worker and discards results against full canonical content. State changes after a result mark it stale. Solver application is a separate, undoable checked transaction. Route evidence is stored outside the schema-v1 project and bound to its content. See [v0.2.0 semantics](V0.2.0.md) for limits and proof scope.
