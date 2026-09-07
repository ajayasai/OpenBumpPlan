# Changelog

## 0.4.0 — generated routing scale and correctness hardening

- Raise actual route generation and independent grid-check capacity from 512 to 4,096 assignments, without raising grid, expansion or witness-work limits.
- Reuse generation-stamped A* arrays rather than allocating/clearing a full grid per net; preserve old paths and diagnostics on 80 randomized differential cases.
- Reject contact/overlap for all nonnegative copper clearances, including tiny positive values that previously allowed contact.
- Expose explicit grid bounds and terminal layers in the browser; bind results to engineering-control values as well as project state.
- Add bounded XZ overlay decoding, 21 security regression tests, 4 real-browser scenarios and actual 4,096-route review replay.
- Retain raw route-generation measurements and clearly distinguish favorable synthetic capacity from industrial qualification.
- Regenerate current example review evidence with version 0.4.0; do not silently accept older engine-bound approvals.

## 0.3.1 — conservative spatial copper verification

- Replace whole-board obstacle and pad-pair scans with deterministic two-dimensional BVH candidate filtering; preserve the independent continuous narrow phase, tolerances, physical assumptions and diagnostic order.
- Add separately bounded spatial work, explicit algorithm/counter fields, malformed-option rejection and fail-closed exhaustion.
- Retain the preceding checker as a test-only oracle; add randomized differential tests, floating-boundary tests and integrated 512-route/8,192-site review replay.
- Retain raw benchmark samples, input hashes and both-complete versus incomplete-work distinctions. The 512-route router limit is unchanged.
- Issue new engine-version-bound sample review bundles. Prior reviews require their original verifier, or an explicitly new review.
- Repair release packaging without rewriting the historical v0.1 publication record. Require source/test dependency coverage and publish only a guarded review branch.


## 0.2.0 — prepared 2026-09-05

- Stage-local branch-and-bound coupled assignment solver, Hungarian bounds, scoped infeasibility/Hall witnesses, honest budget outcomes, and engineering-change limits/penalties.
- Conservative multi-layer grid routing, explicit off-grid errors, route-order trials, independent route-witness verification, and route JSON/SVG.
- SHA-256 review bundles with recomputed findings, expected-project freshness, native Ed25519 signing, and caller-trusted public-key verification.
- Engineering workspace with explicit checked Apply, cancellation, stale-result handling, examples, downloads, and browser/CLI evidence interoperability.
- Expanded positive/adversarial/property tests, fixed-seed quality corpus, documented resource/proof boundaries, and guarded existing-repository updater.
- Prepared CI includes native browser navigation/persistence tests; remote CI and publication are not asserted by this source package.

## 0.1.0 — 2026-09-05

Initial planning alpha: five-stage model, interactive studio, configured rules, heuristic assignment optimization, revision comparison, JSON/CSV/limited LEF import, report exports, CLI, synthetic examples, tests, and MIT license. Published separately to the existing public GitHub repository.

## 0.3.0 — 2026-09-06

Scalable integer-cost assignment with independent residual/Hall certificates; coupled hard-constraint search with replayable partition coverage; negotiated-congestion routing; independent continuous finite-width trace/via/pad clearance checks; expected-technology-bound review verification; integrated UI/CLI; new regression, exhaustive-oracle, adversarial and native-browser suites. Fixed corpus routing completion 71→88/100; no vendor superiority claim.
