# Competitive evidence: what this release does and does not establish

Review date: 5 September 2026. The public goal is an inspectable, useful alternative for planning and review; broad superiority must be earned with matched measurements.

## Verified improvements over OpenBumpPlan v0.1.0

The unchanged original heuristic is compared against stage-local exact search over a fixed 40-seed synthetic corpus. New search improves three cases, ties 37, and loses none; aggregate score is 26,848 versus 26,708. A deliberately constructed differential-pair bottleneck illustrates a feasibility gap: the heuristic leaves four hard errors, while exact search finds a passing complete mapping. These measurements establish improvements over the prior implementation on those inputs, not universal optimizer superiority.

Layered routing, a search-independent witness checker, current-project-bound SHA-256 bundles, and external-key Ed25519 verification did not exist in v0.1.0. They are now executable UI/CLI workflows with positive and adversarial tests. No inference is made that commercial products lack comparable functionality.

## Commercial capability boundary

Synopsys describes 3DIC Compiler as an integrated multi-die platform including automated high-speed die-to-die routing, multiphysics analysis, and signoff, with thermal, PI, SI, and stress integrations [1]. Cadence describes Integrity 3D-IC as unifying system planning, implementation, and signoff, integrated with digital, analog, and packaging environments and system-level analysis [2,3]. These are vendor-described capabilities, not independent measurements performed here.

OpenBumpPlan v0.2.0 has no equivalent validated multiphysics/signoff stack, native vendor database integration, or industrial capacity qualification. Geometric ground coverage, route clearance, and planar length must not be sold as substitutes. Calling this release better than *all* proprietary alternatives would be unsupported.

## Acceptance gates before a superiority claim

| Gate | Required evidence | Current state |
|---|---|---|
| Interchange correctness | Independently supplied public/authorized designs; matched units, die orientation, net identity, pair polarity, keep-outs and package-stack semantics; reproducible round-trip diffs. | JSON/CSV and limited LEF only; no qualified native round trips. |
| Coupled mapping quality | Same input, hard constraints, candidate freedom and time budget on named vendor/version baselines; feasibility, objective, remapping churn, and solve uncertainty reported for every case. | Small synthetic comparison against prior OpenBumpPlan only. |
| Routing utility | Same stack, trace/via technology and terminals; complete connectivity plus external physical DRC; length, vias, congestion and repair effort. | Conservative abstract grid witness, not physical DRC. |
| Electrical/thermal reliability | Correlation against independent SI/PI/thermal reference solvers and measured/qualified technology data with stated tolerances. | Not implemented. |
| Interactive capacity | 10k/50k/100k-site suites, cold start, p50/p95 drag/filter/route latency, memory, repeated trials, browser and workstation versions. | Not measured; exact search intentionally capped. |
| Trust and collaboration | Reviewer identities/roles, key lifecycle/revocation, access controls, immutable external audit, threat-model and penetration review. | Local signatures and content checks only. |
| Productivity and robustness | Blinded representative user tasks, success/time/error rates, accessibility, crash/data-loss recovery, cross-browser matrix. | Automated Chromium workflows only. |

A benchmark submission should store hashes of inputs and raw outputs, tool/version/configuration, machine specification, all attempted cases (including failures/timeouts), conversion warnings, and independent check results. Restrict comparisons to the functions the tools actually share. Do not compare OpenBumpPlan's proxy score with a vendor's electrical objective or call an incomplete run a solved case. Any claim must name the tested workload and dimensions; an unqualified “all alternatives” claim is not justified by a finite convenience sample.

## Primary sources

[1] Synopsys, “3DIC Compiler: Platform for Multi-Die Designs.” https://www.synopsys.com/implementation-and-signoff/3dic-design.html — consulted 2026-09-05.

[2] Cadence, “Integrity 3D-IC Platform.” https://www.cadence.com/en_US/home/tools/digital-design-and-signoff/soc-implementation-and-floorplanning/integrity-3dic-platform.html — consulted 2026-09-05.

[3] Cadence, “Integrity 3D-IC Platform Datasheet.” https://www.cadence.com/en_US/home/resources/datasheets/integrity-3d-ic-platform-ds.html — consulted 2026-09-05.

For implementation rather than competitive claims: Node.js native crypto documentation, https://nodejs.org/api/crypto.html; SHA algorithm specification, RFC 6234, https://www.rfc-editor.org/rfc/rfc6234.html. Standard algorithms are not claimed as novel research.
