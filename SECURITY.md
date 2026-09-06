# Security and engineering safety

OpenBumpPlan is an engineering alpha, not qualified signoff software. A passing configured-rule report does not authorize fabrication, establish electrical safety, or prove routing feasibility.

## Data boundaries

Design computation runs in the browser or local CLI. There is no upload API, telemetry SDK, external CDN, remote font, or runtime service dependency. LocalStorage is convenience persistence, not encrypted storage or a secure vault. Other scripts on the same origin, browser extensions, shared machine users, and exported files can expose design data. Use a dedicated trusted origin/profile for confidential designs. Publicly hosting the app still reveals ordinary site-access information to the host.

The public-repository script commits the source directory. Do not put real customer, PDK, foundry, or confidential design files there before publishing. Supplied designs and outputs are synthetic. No credentials are shipped.

## Input and output handling

Text import size, object counts, coordinates, and analysis work are bounded. Malformed models are rejected. Unsupported LEF geometry is rejected instead of silently discarded. HTML/SVG labels are escaped; no input strings are interpreted as script. CSV exports use a reversible leading-apostrophe encoding to reduce spreadsheet formula interpretation. The encoding is explicit and decoded only when the matching marker is present. Spreadsheet programs vary: treat JSON as authoritative and inspect CSV before using it in another tool.

The application CSP disallows outbound connect requests and eval. It permits inline scripts/styles for a self-contained build, so integrity still depends on the HTML itself. Download it from a trusted source and compare its SHA-256 against a trusted copy. `dist/SHA256SUMS` detects accidental changes only when the checksum file's provenance is trusted.

## Limits

The server is static/read-only and loopback by default; it is not hardened for hostile multi-tenant deployment. No multi-user authentication, encrypted workspace, real-time collaboration, reviewer-role enforcement, key revocation, or tamper-proof external audit exists. v0.2.0 adds local Ed25519 manifest signatures, not an approval authority. FNV review IDs are not cryptographic hashes. DOM/SVG rendering and repeated analyses can be slow for large, dense, or deliberately adversarial inputs even within caps. Budget exhaustion must be treated as an incomplete review.

## Reporting

Do not attach confidential designs or exploit-bearing files to a public issue. Report a minimal synthetic reproduction through a private maintainer channel once one is established. No security-response SLA or dedicated reporting address is currently promised. Follow responsible disclosure; contributors must not embed secrets in fixtures, screenshots, logs, or reports.

## v0.2.0 evidence and publication

Review bundles are self-contained, SHA-256-bound records. A hash-only check is not an authenticity check: an adversary can replace a project and recompute all unkeyed hashes. Use an independently trusted Ed25519 public key and an expected current project digest. Signature verification fails closed, including routing pass flags, on invalid keys, altered signatures, wrong keys, or mismatched evidence. A signed old project is still old; signatures alone do not establish freshness, identity, role, or signoff. The hashing fallback has known-vector/OpenSSL cross-tests, not external crypto certification.

A route witness proves only the configured conservative grid constraints checked by the verifier. Physical trace/via stacks, foundry rules, electrical/thermal behavior and off-stage copper are not inferred. The exact solver reports bounds/status within a finite stage scope and floating-point model; do not reinterpret it as a global physical optimum.

The prepared update helper validates an explicit file/hash manifest and refuses a repository that has moved beyond its reviewed base commit. It updates only listed files, never force-pushes, never changes visibility, and prints success only after a public-visibility/commit readback. The manifest itself must come from a trusted release source: it is not signed by an external publisher. Review workflow/source changes before allowing publication.
