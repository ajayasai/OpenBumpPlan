# Local v0.3.1 validation record

The tested standalone build is 292,842 bytes, SHA-256 `80ebc5f3fe231d0d9a54392191f63e93837bfa48cf7f8bf9dfb336f9312f9f0d`.

**741 Node tests passed, zero failed, zero skipped.** The prepared source ZIP was separately extracted, rebuilt, checked against the manifest and tested again: all 741 tests passed. Full TAP output is retained separately in the qualification artifact, avoiding duplication of environment-specific timings in the source archive. This includes the original 562 tests, 174 spatial/differential tests and five additional release-coverage regressions.

**31 Chromium scenarios passed** against the actual bundled application: 12 planning, 11 Engineering, eight coupled-proof/copper workflows. The copper workflow checks the new algorithm identifier and bounded spatial counter and replays the exported review through the CLI. These runs used Chromium 144.0.7559.96 and Playwright `set_content`; see `browser-planning-v0.3.1.json`, `browser-engineering-v0.3.1.json` and `browser-copper-v0.3.1.json`.

Both native-origin modes were attempted and blocked by this environment's `ERR_BLOCKED_BY_ADMINISTRATOR` navigation policy. No browser policy was disabled. **Local localhost-origin persistence is not verified by these results.** GitHub qualification separately runs native-origin scenarios on its own runner; its result must be read from Actions, not inferred from this local record.

The fixed copper benchmark retains all five measured samples per algorithm, exact input hashes, environment, work budgets and semantic-agreement results in `qualification-copper-v0.3.1.json`. Speedup is only computed when both versions complete. The 512-route/8,192-site case also passed grid verification and independent review replay. Higher route-count cases are explicitly copper-only.

The preceding staged source was first tested unchanged: all 562 existing tests passed. Its original publication was blocked by one stale manifest entry, documented in `RELEASE-RECOVERY.md`; the historical record and old manifest remain preserved.

No commercial EDA system or industrial design was tested. No electrical, thermal, mechanical or foundry qualification is implied. This record reports completed local checks, not a merged PR or successful GitHub release.
