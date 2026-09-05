# Competitive scope, evidence, and roadmap

## What can honestly be claimed

OpenBumpPlan provides a working local-first, open-source planning/review workflow with explicit interchange data, inspectable rule implementations, a headless regression gate, reproducible test fixtures, and scriptable reports. Its supplied build uses no external runtime packages or service account.

It has **not** been benchmarked against commercial EDA products. It is not established to be faster, more capable, more reliable, easier to use, or more accurate than all closed-source alternatives. MIT licensing and inspectable source are concrete differences; broader superiority is a research/engineering target, not a result.

## Official product context, checked 5 September 2026

- Cadence's **Integrity System Planner** materials describe system connectivity and cross-substrate IC/interposer/package/PCB planning. Its **OrbitIO** materials likewise describe unified chip/package/board data and signal/bump/ball assignment. See [Cadence datasheet](https://www.cadence.com/en_US/home/resources/datasheets/integrity-system-planner-ds.html) and [cross-substrate interconnects](https://www.cadence.com/ko_KR/home/tools/ic-package-design-and-analysis/ic-package-design-flows/cross-substrate-interconnects.html).
- Synopsys **3DIC Compiler** is positioned across exploration, implementation, and multiphysics/signoff, not just coordinate mapping. See [official product page](https://www.synopsys.com/implementation-and-signoff/3dic-design.html) and [TSV/bump co-design discussion](https://www.synopsys.com/blogs/chip-design/3dic-packaging-design-tools-guc.html).
- OpenROAD's pad module includes bump-aligned IO pad placement. This is useful implementation functionality but does not, by itself, constitute this application's independent review workflow. See [official pad documentation](https://openroad.readthedocs.io/en/latest/main/src/pad/README.html).

Vendor pages are evidence of advertised scope, not independent verification of every feature or a benchmark performed here. We have not inspected proprietary implementations or used commercial licenses in this project.

| Capability | OpenBumpPlan 0.1.0 | Meaningful next comparison |
|---|---|---|
| Cross-stage coordinate mapping | Implemented for a directed five-stage chain | Independent correctness fixtures, native-format round trips |
| Interactive review and exports | Implemented locally | Blinded completion-time and error-rate study with packaging engineers |
| Constraint-aware optimization | Heuristic coupled optimizer; exact linear subproblem | Shared constraints, objective, timeout, hardware, and verified feasible outputs |
| Full vendor-format support | Not implemented; CSV/JSON and RECT-only LEF | Licensed native adapters with provenance and semantic round-trip tests |
| Routing and escape planning | Not implemented | Routed feasibility, vias/layers, design-rule checks, congestion |
| 3D alignment and TSV implementation | No Z/face-aware physical model or TSV solver | Verified rotations/reflections, stack connectivity and landing tolerance |
| Electrical/thermal/mechanical signoff | Not implemented | Correlation against trusted solvers and qualified testcases |
| Industrial scale | Small/sparse synthetic measurements only | Representative dense 10k/100k+ site projects, memory and UI latency distributions |
| Collaboration / approvals | Local history only | Multi-user authorization, conflict resolution, signed auditable approvals |

## Roadmap with acceptance criteria

**1. Interchange and multi-die correctness.** Add a full supported LEF/DEF parser through a maintained adapter, netlist imports, explicit pad shapes/layers, die-face orientation, Z coordinates, and rigid-transform provenance. Publish metamorphic tests for every rotation/reflection and lossless project round trips. Reject unsupported vendor semantics rather than approximating them silently.

**2. Coupled optimization.** Add a separate CP-SAT/MIP adapter for pair assignment, shielding, spacing, quotas, and locked connections. Require independent post-validation, bounded runtime, and reported solver status/gap. Compare against the current heuristic, greedy baselines, and available reference mappings on a released synthetic/permissioned corpus; measure feasibility rate and objective quality, not just runtime.

**3. Route-aware planning.** Add stackup/layer/via models and a routing adapter. Keep the existing score as a explicitly named proxy, then measure routed wirelength, congestion, layer transitions, real differential electrical skew, and rule-clean escape success. Do not market geometric crossing reduction as routability proof.

**4. Large-scale interaction.** Move incremental analysis into workers, adopt spatial picking and virtualized/WebGL rendering, and benchmark dense cases. Define p50/p95 pointer latency, first-frame time, peak memory, analysis completeness, and cancellation response. Record failures and include adversarial crossing patterns.

**5. Engineering adoption.** Commission independent packaging-engineer review, secure signed approval records, and implement permissioned collaboration only when needed. Obtain valid commercial licenses and permitted benchmark conditions before publishing head-to-head conclusions. No hypothetical win should be represented as a measured result.

A credible competitive release needs evidence in each targeted use case. This release supplies a reproducible base for that process, not a substitute for it.
