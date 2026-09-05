# Security and engineering safety

OpenBumpPlan is an engineering alpha, not qualified signoff software. A passing configured-rule report does not authorize fabrication, establish electrical safety, or prove routing feasibility.

## Data boundaries

Design computation runs in the browser or local CLI. There is no upload API, telemetry SDK, external CDN, remote font, or runtime service dependency. LocalStorage is convenience persistence, not encrypted storage or a secure vault. Other scripts on the same origin, browser extensions, shared machine users, and exported files can expose design data. Use a dedicated trusted origin/profile for confidential designs. Publicly hosting the app still reveals ordinary site-access information to the host.

The public-repository script commits the source directory. Do not put real customer, PDK, foundry, or confidential design files there before publishing. Supplied designs and outputs are synthetic. No credentials are shipped.

## Input and output handling

Text import size, object counts, coordinates, and analysis work are bounded. Malformed models are rejected. Unsupported LEF geometry is rejected instead of silently discarded. HTML/SVG labels are escaped; no input strings are interpreted as script. CSV exports use a reversible leading-apostrophe encoding to reduce spreadsheet formula interpretation. The encoding is explicit and decoded only when the matching marker is present. Spreadsheet programs vary: treat JSON as authoritative and inspect CSV before using it in another tool.

The application CSP disallows outbound connect requests and eval. It permits inline scripts/styles for a self-contained build, so integrity still depends on the HTML itself. Download it from a trusted source and compare its SHA-256 against a trusted copy. `dist/SHA256SUMS` detects accidental changes only when the checksum file's provenance is trusted.

## Limits

The server is static/read-only and loopback by default; it is not hardened for hostile multi-tenant deployment. No authentication, encrypted workspace, real-time collaboration, signed approvals, or tamper-proof audit exists. FNV review IDs are not cryptographic hashes. DOM/SVG rendering and repeated analyses can be slow for large, dense, or deliberately adversarial inputs even within caps. Budget exhaustion must be treated as an incomplete review.

## Reporting

Do not attach confidential designs or exploit-bearing files to a public issue. Report a minimal synthetic reproduction through a private maintainer channel once one is established. No security-response SLA or dedicated reporting address is currently promised. Follow responsible disclosure; contributors must not embed secrets in fixtures, screenshots, logs, or reports.


## v0.2 computation evidence

SHA-256 evidence is document integrity and deterministic replay, not authentication, a signature, trusted timestamp or approval. Verify against the intended original project and trusted engine version. Browser evidence needs platform Web Crypto and fails explicitly if unavailable. Do not publish evidence containing proprietary project/candidate data. Replay is bounded by caller-authorized node/expansion limits; route/path input sizes are capped. Stage workers are cancellable and use complete canonical document comparisons for stale-result rejection. The short display fingerprint is still a convenience identifier, not a security boundary.
