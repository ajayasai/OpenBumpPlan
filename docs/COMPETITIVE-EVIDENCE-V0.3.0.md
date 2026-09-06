# Competitive evidence, v0.3.0

Reviewed 6 September 2026. No commercial tool was executed in this environment. OpenBumpPlan must not claim to beat every closed-source alternative.

## External primary sources

- Cadence Integrity System Planner: https://www.cadence.com/en_US/home/resources/datasheets/integrity-system-planner-ds.html
- Synopsys 3DIC Compiler: https://www.synopsys.com/implementation-and-signoff/3dic-design.html
- Synopsys fanout RDL routing constraints: https://www.synopsys.com/blogs/chip-design/fanout-rdl-routing-design-automation.html

Cadence describes unified IC/interposer/package/PCB planning, connectivity optimization and implementation interoperability. Synopsys describes automated high-speed die-to-die routing and integrated multiphysics/signoff. Their advertised capabilities exceed this project's current native-format integration, validated electrical/thermal physics and production qualification. Vendor claims are not independently reproduced measurements.

## What the current evidence supports

| Axis | Demonstrated here | Not demonstrated |
|---|---|---|
| Openness / inspection | MIT source; local runtime without npm dependencies; algorithm and check implementations inspectable | Lower total organizational cost under a measured deployment |
| Optimization | Integer objective certificates; replayable hard-constraint search; 24-source coupled repair; favorable 4,096-source sparse case | Better objective or runtime than a named vendor on matched industrial designs |
| Routing | 71 to 88 complete grid witnesses on fixed 100-case synthetic corpus versus the project's old router | Foundry-qualified detailed routing or commercial head-to-head advantage |
| Geometry | Continuous declared-width/pad/via/clearance checks independent of search rasterization | Complete process-rule, 3D, electromagnetic or reliability analysis |
| Review | Content binding, trusted-key signatures, stale-result rejection, explicit assumptions | Multi-user approval authorization, regulated audit policy or external security audit |
| Interoperability | Existing CSV/JSON plus documented LEF RECT subset | Full native commercial round trips and complete LEF/DEF/GDS/IPC-2581 support |

## Acceptance protocol before a stronger claim

Use licensed, redistributable reference designs and freeze technology, imported semantics, constraints, legal assignments, hardware, timing ceilings and tool versions. Report ALL predetermined cases, including timeouts, rejected imports and manual interventions. Compare fully validated route completion, same-objective mapping quality, route length/vias/layers, hard-constraint correctness, memory, end-to-end engineer time, and round-trip semantic loss. Have another implementation or independent reviewer validate results. Include adversarial malformed models, restarts/persistence, scaling, real process data and real downstream implementation.

A superiority claim must identify the task, baseline product/version, corpus and metric. OpenBumpPlan's present advantage is inspectable, reproducible planning and evidence—not proven full-suite replacement.
