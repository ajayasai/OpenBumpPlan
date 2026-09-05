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

`revisions.js` implements atomic clone/check/commit transactions, up to 50 undo snapshots, redo, and up to 200 local audit records. It also compares structure and propagated net/physical effects. Review IDs use noncryptographic FNV-1a over canonicalized content; they are labels, not signatures. A proper signed approval system would be a separate feature.

`importers.js` checks units and formats before model normalization. Imports are previewed with analysis and applied explicitly. `exporters.js` escapes HTML/XML, supports reversible spreadsheet-safe CSV, generates inspectable SVG/HTML/Markdown, and writes a compact ASCII-transliterated vector/text PDF without font dependencies.

## Browser

`src/app.js` is a DOM/SVG application using delegated controls. It implements five workspace tabs and a local import dialog, inspector, rule editor, mapping operations, array generator, and exports. Site movement is one undoable transaction on pointer release. A worker performs optimization so the main thread can accept cancellation and other edits; revision plus fingerprint checks discard stale results.

Ordinary UI rule analysis is synchronous. Large or dense projects can pause the UI despite the geometry budget. DOM/SVG rendering is not virtualized beyond table/issue pagination and suppressed labels on larger maps. This release therefore does not promise responsive interaction at its maximum schema size.

The standalone build bundles modules into closures, embeds CSS, and embeds the worker source as a Blob. It does not use eval or fetch external dependencies. A restrictive CSP disables outgoing connect requests. Browser localStorage holds one active project when available; failure is surfaced and JSON export remains available. Session baselines and undo stacks are not durable backups.

## CLI and local server

The same core drives checks, optimization, diffing, and reports. No HTTP API is required. The optional server serves allowlisted static extensions using GET/HEAD, rejects dotfile/escaping/symlink paths, defaults to loopback, and offers no writes. It is not a production multi-user server or an authentication layer.

## Practical resource boundaries

The schema caps 10,000 sites, 20,000 links, 1,000 dies, 1,000 keep-outs, and 1,000 quota regions. Each text import is capped at 5 MiB. Geometry analysis has a configurable 100–10,000,000 comparison budget and at most 5,000 retained findings. Truncation and budget exhaustion are explicit and cannot produce a clean readiness verdict.

The optimizer defaults to at most 256 source and 512 target sites per stage (configurable within 512/1,024 safety limits) and a bounded number of swap trials. The browser uses 700 swap trials, the CLI default uses 1,500, and the recorded synthetic benchmark uses 100. These are limits, not capacity guarantees.

## Extension design

Keep the canonical interchange format independent of vendor databases. Add adapters outside the model, with round-trip fixtures and unit/orientation provenance. Route-aware checks should consume actual paths and stack layers, not reinterpret the existing ratsnest metric. Electrical solvers should produce separately named findings and provenance. A future coupled exact solver should distinguish proven feasibility, optimality gap, timeout, and global infeasibility, and validate its output through the same independent rule engine.


## v0.2 engineering modules

`src/core/exact.js` provides the small-stage branch-and-bound oracle and Hall witnesses. `routing.js` provides explicit routing configuration, A* and an independent geometric path checker. `evidence.js` provides platform SHA-256 document binding and deterministic replay. `src/lab.js` renders the Engineering workspace and synthetic demonstrations. The worker dispatches heuristic, exact and routing tasks; stale results compare complete canonical input documents. Project schema remains v1 and engineering evidence/configuration use explicit sidecars. [Guarantees, limits and numeric semantics](ENGINEERING.md) are part of the API contract.
