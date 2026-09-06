# Recovery of the blocked v0.3.0 staging publication

On 6 September 2026 the `upgrade/v0.3.0` branch still held the v0.1 source tree and a 76-file compressed source overlay. It was not a completed publication of v0.3.0.

GitHub run `34023305898` successfully verified archive SHA-256 `624d5de42a912190e4314d3f257a72e21e3d362d2f44a302ad7fb80a9fce9747`, applied the overlay and rebuilt exactly 283,089 bytes with SHA-256 `4619dbf5d91bfcbf67fcec19a18a3d4e5badd8bfeb3bb83a32aadbe4c0415972`. It then stopped at release-manifest verification. Tests, benchmark reruns, native-browser qualification and the final source commit did not run in that attempt.

## Root cause, not a bypass

The v0.3.0 manifest expected `docs/release-validation.json` to have 533 bytes and SHA-256 `7c54248bfb6cc71d8421146cbda62cb080cdffb556247f126eeb983e669dac5a`. The overlay omitted that file. The actual retained v0.1 publication record had 1,009 bytes and SHA-256 `988ca424fab34becb682b0fba0a76844bc82c88f5e40462e498b3c50fb5823ad`.

Comparison of every original manifest entry after rebuilding found this single mismatch. The actual historical file correctly records the old publication, so it is preserved byte-for-byte. The archived v0.3.0 manifest is also preserved; it is not an active manifest for v0.3.1. A newly generated v0.3.1 manifest binds the actual deliverable files, including that historical record, and is checked against a separately extracted clean package.

Diagnostic commit `014aed5a7890bc6b3ebc89c85c7ba348c7e31173` retained the exact expanded source as a GitHub artifact. Downloaded ZIP SHA-256: `57f3c9967032b8d05d39b0291d5881cf8817fbe3beb91776f824e63fe463e357`. The expanded baseline passed all 562 existing Node tests locally before the spatial-index changes.

## Preventing recurrence

The release verifier now requires all files under `src`, `scripts` and `tests` (except Python bytecode caches) to appear in the manifest, rejects symlinks and omissions, and includes the historical validation record as a required file. A clean source-package extraction must rebuild to the retained standalone checksum and pass the release verifier and Node tests.

The publication workflow checks out the immutable triggering commit. Explicit Bash shell selection enables pipeline failure propagation, so `npm test | tee ...` cannot hide a failing test exit. Rerun evidence is retained separately from the originally measured files. The maintainer publisher targets a new review branch; it never directly updates `main` or force-pushes.

Local success is not a GitHub CI result, and a staged branch is not a released main branch. Consult the actual pull request and Actions checks for the current publication state.
