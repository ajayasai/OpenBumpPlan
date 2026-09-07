# Contributing

Use Node.js 22+ and Python 3 (standard library needed by the security regressions), and run `npm test && npm run build`. No package install is needed for the core. Optional browser tests require Python, Playwright, and a local Chromium; see `docs/VALIDATION.md`.

Keep changes small and reproducible. Add synthetic fixtures for correctness regressions, property tests for geometry/assignment changes, and a real-browser scenario for new interactive workflows. Rebuild the standalone HTML after changing the application. Document units, coordinate conventions, error semantics, complexity, unsupported cases, and approximation boundaries.

Do not add proprietary PDKs, customer designs, native databases without redistribution permission, secrets, or copied vendor code. Use independent, minimal, synthetic examples. Preserve third-party licenses for any future dependency and disclose its purpose. No dependencies are bundled today.

Feature documentation must distinguish implemented behavior, tested behavior, untested assumptions, and roadmap targets. Do not rename geometric checks as electrical or manufacturing signoff. A heuristic failure is not proof of infeasibility, and a local optimum is not a global optimum. Performance comparisons need a published protocol, datasets, environment, and both successful and unsuccessful cases.

Use the MIT license for contributions unless a separately documented component license is necessary. Read the actual GitHub Actions results for the reviewed commit; a past passing run does not qualify a changed branch. There is no maintainer response SLA.
