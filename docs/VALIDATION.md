> Historical v0.1.0 record. For v0.2.0, see [current validation](VALIDATION-V0.2.0.md), [engineering semantics](V0.2.0.md), and [competitive evidence](COMPETITIVE-EVIDENCE.md).

# Validation record — 0.1.0 source delivery

These are checks actually performed in the delivery environment on 5 September 2026. They are not certification or a commercial benchmark. Raw records accompany the project.

## Automated checks

**151 Node tests passed, zero failed.** Run `npm test`. The test files cover schema normalization, malformed inputs and safety caps, coordinate transforms, graph semantics, CSV quoting/units/formula-safe round trips, supported/unsupported LEF forms, geometry predicates, spatial indexing, every implemented rule family, regression gates, atomic rollback/undo/redo, optimization, exports, and CLI exit behavior.

The assignment tests include 120 seeded small masked cost matrices checked against brute-force solutions. This validates the Hungarian implementation's linear subproblem, not global optimality of the full coupled planner. Geometry sweep and spatial-index results are compared with brute-force cases. Transform round trips cover all eight 90-degree rotation/reflection combinations. The report is [`node-test-results.tap`](node-test-results.tap).

**12 Chromium integration scenarios passed, zero failed.** The test runs the actual standalone build in Chromium 144.0.7559.96 through Playwright. It exercises boot/five-stage data, worker optimization, undo/redo, inspector and keyboard edits, strict net-conflict rollback, invalid drafts, pointer drag/snapping, occupied mapping replacement, locks, CSV preview/apply/duplicate rejection, generated arrays, all nine download formats, revision review, embedded ICD rendering, search, layer/exploded/zoom controls, and rule editing. The scenario groupings and timings are in [`browser-test-results.json`](browser-test-results.json). There were no uncaught page exceptions or HTTP(S) requests during these scenarios.

```sh
# Core tests and build use no npm dependencies:
npm test
npm run build

# Optional browser harness; Python/Playwright and Chromium must be installed:
python tests/browser_test.py --chromium /path/to/chromium
```

**Browser test limitation:** managed Chromium prohibited both file:// and localhost navigation. The harness therefore loads the actual HTML with `set_content` in a fresh browser context for each scenario. It does not bypass the navigation policy, disable CSP, or replace app functions. Real-origin localStorage persistence and native-file/local-server browser navigation were **not** verified. Storage-unavailable handling is exercised. Firefox, Safari, mobile devices, assistive technology, and enterprise deployment environments are not qualified.

## Export and schema checks

The example PDF was generated using the application/CLI exporter, opened with PyMuPDF, and all six pages rendered. A montage and page images were visually inspected; extracted text bounding boxes remained within page bounds. The PDF contains vector/text content and valid cross-reference structures. HTML, JSON, SVG, and CSV are independently exercised by export tests. ASCII-transliteration limits of PDF labels are documented rather than hidden.

The Draft 2020-12 structural schema was checked with Python `jsonschema`, and both supplied complete project JSON examples validate against it. Runtime model/rule validation remains necessary for references and geometry.

The read-only local server was also accessed through local HTTP requests, independently of the blocked browser navigation. Normal HTML requests returned HTTP 200 with the expected content type and `nosniff` header. See [`http-check-results.json`](http-check-results.json) for the other protocol checks performed.

## Recorded synthetic results

| Case | Before | After |
|---|---:|---:|
| Dual-chiplet score | 27,540 | 25,920 |
| Dual-chiplet total L1 length, um | 27,240 | 25,920 |
| Dual-chiplet crossings | 2 | 0 |
| Dual-chiplet hard errors | 0 | 0 |
| Reversed-grid score, 128 links | 1,804,250 | 32,000 |
| Reversed-grid crossings | 4,607 | 0 |

The dual-chiplet case has 122 sites and 96 assignments. The reversed-grid case is a deliberately favorable remapping demonstration with 256 sites, not a representative industrial design. The benchmark harness uses 100 local-swap trials; the browser uses 700 and the CLI default is 1,500.

| Sparse validation case | Median engine-analysis time, five runs |
|---|---:|
| 128 sites / 64 links | 1.05 ms |
| 512 sites / 256 links | 3.36 ms |
| 2,000 sites / 1,000 links | 9.43 ms |
| 8,000 sites / 4,000 links | 33.72 ms |

Recorded environment: Node.js v22.16.0, Linux x64, AMD EPYC 9V74 processor. Exact environment, times, comparison counts, and limitations are in [`benchmark-results.json`](benchmark-results.json). Run `npm run benchmark` to produce a new environment-specific record; documentation numbers above describe the initial run and will not automatically change.

These cases favor the bounding-box sweep. Dense crossings, coincident coordinates, large spatial neighborhoods, or many constraints can be substantially slower. The geometry budget can produce incomplete analysis, which must not be reported as a clean design. Engine-analysis timing excludes SVG rendering, browser layout, import interaction, and real engineering review time.

## Not verified or claimed

No commercial product was run for comparison. No routed designs, foundry-qualified checks, electrical/thermal/current simulations, production package, or customer design was verified. No assertion of full LEF compatibility or industrial-capacity equivalence is made. Docker builds, GitHub Actions, GitHub Pages, public-repository creation, signed approvals, and multi-user deployment were not executed here. The included publishing and CI/deployment files are source deliverables, not completed remote actions.
