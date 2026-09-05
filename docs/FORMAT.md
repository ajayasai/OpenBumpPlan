# Project format and rule semantics

## Units and geometry

The canonical project is JSON with `schemaVersion: 1` and `units: "um"`. Coordinates are finite numbers with absolute magnitude at most 1e9. Y increases upward. A site with `dieId: ""` uses package XY. A site referring to a die uses that die's local coordinates.

For die width W, translation (tx, ty), and local point (x, y): first set x to W−x if `mirrorX` is true; then apply a counter-clockwise 0/90/180/270-degree rotation about the local origin; finally add (tx, ty). Translation is the transformed local origin, not necessarily the lower-left corner of the rotated bounding box. The inverse transform is implemented and tested for all eight rotation/reflection combinations. This convention is explicit and is **not** an automatic conversion from any vendor's flip-chip/face/bottom-view convention. No Z coordinate is modeled.

The visual exploded layout applies display-only offsets; all constraints and scores use physical coordinates. Distinct stages can overlap in projected XY without being same-stage site collisions.

## Objects

`dies`: `{id, name, x, y, width, height, rotation, mirrorX, edgeKeepout, cornerKeepout}`.

`ports`: `{id, label, kind, dieId, x, y, net, domain, role, pair, polarity, locked, required}`. The ordered kinds are `pad`, `bump`, `interposer`, `ball`, `pcb`. Roles are `any`, `signal`, `clock`, `power`, `ground`, `reserved`, and `nc`. A differential pair has one shared pair identifier and exactly one `+` and one `-` member per occupied stage. Pair identifiers should be unique across the whole project, for example `CORE_TX0` rather than a repeated `TX0` for unrelated interfaces.

`connections`: `{id, from, to, net, locked}`. Connections have one physical source and destination. A physical site supports at most one incoming and one outgoing edge, allowing a chain through stages. A net may occur at multiple distinct ground/power sites. Same-stage lateral routes and electrical fanout from one site are not supported. Intermediate routing or multi-terminal topology needs a future richer model.

`keepouts`: `{id, x, y, width, height, dieId, kinds}`. Empty `dieId` means a package-coordinate rectangle affecting the listed kinds. A die-specific rectangle is expressed in that die's local frame and affects ports belonging to that die. It does not block another die's or package-coordinate sites merely because they project over it. Rectangular boundaries are included.

`regions`: `{id, x, y, width, height, kind, domain, minGround, minPower}`. Rectangles use package XY. Ground quotas count connected ground sites; power quotas count connected power sites, optionally restricted by the region's domain. There are no per-site current capacities.

IDs must be nonempty strings and unique within their object type. Site IDs are globally unique across stages. Standard metadata strings are limited to 512 characters and exclude control characters. Project descriptions may be up to 10,000 characters. The runtime validates references, coupled fields, rule names, and object counts; see `src/core/model.js`.

[`project.schema.json`](project.schema.json) describes the normalized structural format. Normalization supplies optional fields before runtime checks. JSON Schema does not replace graph-reference validation or the geometric rule engine. Unknown metadata fields can be preserved, but **unknown rule keys are rejected** so a misspelled constraint cannot silently disappear.

## Net and domain propagation

Logical metadata propagates from upstream sites through ordered stages. Blank downstream metadata inherits; explicit downstream metadata is retained and checked for conflicts. A declared edge net is also checked. No voltage identifier is inferred from a coordinate, filename, or electrical-looking label. Active signal/clock/power sites lacking a domain, or any active site lacking a net, are reported as incomplete. `any` is a candidate-site role, not an electrical classification; an active path still having `any` produces a warning.

Only connected, active sites participate in occupancy, neighbor coverage, pair grouping, and quotas. Unassigned candidate sites may exist inside keep-outs but cannot legally be connected there. `required` flags sites that must be used. `requireCompletePaths` checks that each active chain continues until at least `terminalKind`; it does not prove that a source corresponds to a complete external functional netlist.

## Rule definitions

| Field | Meaning |
|---|---|
| `maxLength` | Maximum Manhattan length of any assignment in physical XY, um |
| `minDomainSpacing` | Minimum Euclidean distance between different known domains on the same occupied stage; ground sites are exempt; 0 disables |
| `pairMaxDistance` | Maximum Manhattan separation of +/− sites on the same occupied stage |
| `pairMaxSkew` | Maximum difference between the two members' Manhattan edge lengths for a stage; not electrical timing skew |
| `clockShieldRadius`, `clockGroundMin` | Number of connected same-stage ground neighbors within Euclidean radius |
| `groundRadius` | Each occupied signal/clock needs a connected same-stage ground within Euclidean radius; 0 disables |
| `requirePowerForSignals`, `powerRadius` | Require a connected same-stage, same-domain power site within Euclidean radius; radius 0 disables this coverage check |
| `minGroundRatio` | Connected grounds / all occupied sites, checked separately per occupied stage; 0 disables |
| `maxCrossings` | Warning threshold for same-stage straight-ratsnest proper crossings, not a routed DRC or hard optimization constraint |
| `crossingWeight` | Score penalty per counted crossing, in the objective's um-equivalent units |
| `geometryBudget` | Finite work budget; incomplete analysis cannot pass review |
| `terminalKind`, `requireCompletePaths` | Required end stage for occupied chains when enabled |
| `allowedStagePairs` | Explicit ordered stage pairs; each must move strictly forward |

Die `edgeKeepout` excludes occupied sites closer than the given local distance from any edge. `cornerKeepout` excludes sites inside a Euclidean-radius disk around any local die corner. Occupied sites outside their declared die are errors. These use point centers, not pad/bump polygon outlines or manufacturing spacing rules.

Ground proximity, domain labels, and quotas are **planning proxies**, not voltage/current/return-path analysis. Check configurations are project-specific assumptions supplied by the engineer.

## Geometry score and completeness

```text
L1 = abs(source.x - target.x) + abs(source.y - target.y)
score = sum(L1) + crossingWeight * crossings
```

Crossings count proper intersections of nonzero, straight, same-stage segments with different logical nets and no shared endpoint. Endpoint contact is not counted. Collinear overlaps are separate warnings, not part of the score. Same-net overlaps/crossings are ignored by this proxy. These are not physical routes and cannot establish routability or a short.

Bounding-box and spatial-grid checks have a finite comparison budget. Budget exhaustion sets `complete: false`, emits `ANALYSIS_INCOMPLETE`, and marks the score/counts as lower bounds. At most 5,000 finding details are retained; totals and `detailsTruncated` remain explicit. UI issue lists show at most 150 and revision tables at most 500 entries; exports contain all retained findings/all revision changes.

## Editing and review gates

Strict mode blocks newly introduced non-draft hard finding signatures. It allows an incomplete project to be built step by step: empty/no-assignment/required-site/path/pair-completeness/net/domain omissions remain visible errors rather than making every partial edit impossible. Existing finding signatures may remain; strict editing is **not** a promise that a previously invalid project becomes valid or that the severity of an existing finding cannot worsen. Warnings do not block editing. Turning strict mode off permits invalid drafts but does not hide their findings.

Optimization and revision regression review include incomplete-interface errors when comparing candidates. An unchanged existing error is not a new regression. Always inspect final analysis: readiness needs complete evaluation, no errors, and no warnings. Imported projects and explicitly edited advanced JSON can introduce errors and are visibly analyzed, not silently certified. Numeric rule changes are allowed so an engineer can tighten rules and see resulting violations.

## CSV import/export

Ports CSV requires `id,x,y`. Optional headers are `label,kind,dieId,net,domain,role,pair,polarity,locked,required,units,_text_encoding`. Select a default kind/unit in the import dialog; per-row explicit values override defaults. Units are `um`, `mm`, or `nm`, converted once to canonical um. CSV import also requires explicit valid boolean syntax for boolean fields. Unknown headers, malformed quoting, duplicate IDs, and nonfinite coordinates are rejected. Existing objects are not silently overwritten.

Assignment CSV requires `id,from,to`, with optional `net,locked,signal,length_um,_text_encoding`. Exported `signal` and `length_um` are informational and are recomputed from the current project when imported.

BOM, CRLF, quoted commas, escaped quotes, and quoted line endings are parsed. Canonical metadata still rejects control characters that the CSV parser itself can decode. Text inputs are limited to 5 MiB.

For spreadsheet safety, text values starting with `=`, `+`, `-`, `@`, or an apostrophe (after whitespace) are prefixed with an apostrophe on export. Rows explicitly carry `_text_encoding=apostrophe-v1`, enabling this importer to remove precisely that extra apostrophe. Do not strip the marker manually or assume another program interprets the encoding identically. JSON is the lossless interoperability authority.

## LEF subset

The importer reads a selected `MACRO`, its `SIZE`, and `PIN`/`PORT` `RECT` geometry. Multiple macros require explicit selection. A pin's point is the center of the bounding box of all its rectangles; multiple rectangles produce an approximation warning. `USE POWER` / `USE GROUND` / `USE CLOCK` metadata is recognized. LEF coordinate values here are interpreted as micrometres; `DATABASE MICRONS` is not an extra divisor for those values.

This is **not a full LEF parser**. Nonzero `ORIGIN`, `POLYGON`, `PATH`, `VIA`, `MASK`, and `ITERATE` forms are rejected rather than silently approximated. Pins without supported rectangles are rejected. Layers/obstructions, full port shapes, routing/technology rules, and vendor extensions are not implemented as physical design objects. Review imported centers and add explicit net/domain information before assignment. See `examples/tiny-die.lef`.

## Reports and revisions

JSON preserves the complete project. Ports/mappings CSV export separate tables. SVG and HTML retain Unicode. The PDF writer uses Base14 Helvetica and printable-ASCII transliteration; unsupported characters become `?`. Use HTML/JSON for exact international labels. The PDF is real vector/text output, not a screenshot or a print-only button.

Revision comparison includes additions/removals/changes to sites, dies, links, keep-outs, regions and rules, plus inherited-net changes and transformed physical movement. Audit entries and revision numbers are not signed. The eight-hex-digit review ID is a noncryptographic content fingerprint excluding audit and revision. Baselines, undo history, and localStorage are conveniences; exported versioned JSON and ordinary version control are the recommended durable record.
