# Routed KiCad handoff

OpenBumpPlan can hand a checked routing stage to KiCad as actual copper: circular SMD terminals, compact Manhattan tracks, full through vias, rectangular keepout rule areas and a generated Edge.Cuts envelope. This is not the older **unrouted terminal-map export**, and is not a manufacturing signoff adapter.

## Browser workflow

Open `dist/interop.html` alongside the planner's `dist/index.html`. Import your project JSON, or explicitly read the planner's project from local storage on the same web origin. In **05 / ROUTED HANDOFF**, load the route-witness JSON produced by the planner or CLI. Supply your own technology and native specification. Build the checked board, inspect the result and download the board, receipt and source inputs. Changing the project, technology or specification disables the old downloads. Every download rechecks the current source identities.

The sample button loads a synthetic crossing fixture and clears the previous independent connectivity contract. Its dimensions are demonstration data, not engineering recommendations. The browser explicitly states that it has **not run native KiCad DRC**.

## Command line

Node 22+; no npm runtime dependencies:

```sh
node scripts/routed-kicad.mjs export project.json routes.json technology.json specification.json new-handoff-directory
node scripts/routed-kicad.mjs verify project.json routes.json technology.json specification.json new-handoff-directory/routed.kicad_pcb new-handoff-directory/receipt.json
```

The export directory must not already exist. It contains the board, receipt, source inputs and limitations. Keep independently reviewed originals for replay; copying a board and all its accompanying inputs together is not authentication of an external design requirement.

Explicit technology, in micrometres:

```json
{"units":"um","traceWidth":250,"viaDiameter":600,"padDiameter":500,"clearance":200}
```

Explicit native specification, in micrometres:

```json
{"viaDrill":300,"boardThickness":1600,"edgeMargin":1000}
```

These numbers are only the synthetic example. Supply appropriate values for your process. The drill must be smaller than the via copper diameter. Geometry must be representable at 1 nm resolution; genuine sub-nanometre input and coordinate overflow are rejected rather than rounded silently.

## What is checked

Before export, the current project and route witness must pass both the existing grid verifier and continuous copper verifier. No stored `verified` or `ok` flag bypasses either recomputation. The exporter preserves the entire selected routing-stage witness, including layer transitions, and never fills gaps in a partial witness.

The receipt binds the normalized project, supplied routes, simplified technology, explicit export specification, file bytes, counts and metrics. Structural replay regenerates the expected native structure from those separately supplied inputs. Changing a trace, pad, via, keepout or net and recomputing its checksum does not authorize that change. This source-bound replay shares the exporter implementation and is **not an independent native geometry oracle**.

The separate `tests/routed_kicad_native_test.py` uses real KiCad `pcbnew`: it expands native tracks to unit edges and compares them directly with source route paths, checks pad identity, position, net and actual copper-layer membership, dimensions, via locations/drills, keepouts and the closed envelope. It repeats after native save/reload, checks native connectivity, and runs `kicad-cli pcb drc`. Removed-track and added-short negative controls must be detected. The test gate uses error severity and the installed KiCad defaults; it is not a check against a foundry rule deck. Successful runs record the actual version and all case results in `routed-kicad-native-results.json`.

```sh
npm run test:routed
/usr/bin/python3 tests/routed_kicad_native_test.py
python tests/routed_browser_test.py --chromium /path/to/chromium
python tests/routed_browser_test.py --native --chromium /path/to/chromium
```

Native routed qualification requires a KiCad version with CLI DRC and layer-specific via APIs (CI uses the official stable KiCad 10 PPA). The separate terminal-map test also exercises the Ubuntu-distributed KiCad 7 parser.

## Deliberate boundaries

Only one selected stage is exported, with at most two routing layers mapped to F.Cu and B.Cu. Native output always has those two copper layers. Blind/buried vias, arbitrary multilayer stackups, filled planes, noncircular padstacks, differential impedance, electrical extraction and manufacturing outputs are not inferred. Disconnected branches with a common net name are rejected; this adapter is not a multi-terminal tree router. The generated rectangular outline is a clearance envelope, **not the original package mechanical outline**. Review it and configure native manufacturing rules before downstream use.

This release supplies evidence of specific functionality, not a head-to-head benchmark against Cadence, Synopsys or Siemens. Industrial rule-deck validation, realistic customer workloads, multi-physics integration and independently measured commercial comparisons remain open qualification work.

## Primary format and API references

- KiCad board format: https://dev-docs.kicad.org/en/file-formats/sexpr-pcb/
- KiCad CLI DRC options and exit codes: https://docs.kicad.org/8.0/en/cli/cli.html
- Actual pad layer membership (`GetLayerSet`, `IsOnLayer`): https://docs.kicad.org/doxygen/classPAD.html
- Official stable Ubuntu installation: https://www.kicad.org/download/details/ubuntu/
