# Final integration hardening

Address every High and Medium finding from the broad review with strict TDD. Do not weaken the release/session/security requirements.

## Required outcomes

1. Wire the real global composition root. `runCliFromDisk`/bootstrap must construct metadata cache, release resolver, artifact cache, session manager, and cleanup dependencies. Confirmed skill install/update must resolve the latest stable release, download/verify/cache the selected `skillPath`, and activate it; `clean` must actually clean sessions. Keep explicit confirmation before network/write operations.
2. Session activation must copy only the requested cached `skillPath`, never the whole repository object or sibling dormant skills. Add regression coverage.
3. RTK/tgrep release management must resolve the selected stable Release tag to an immutable 40-hex commit SHA, require a verified checksum, reject missing/mismatched checksum, and persist/verify the SHA. Do not permit requested older versions; always select newest stable release. Preserve rollback and explicit confirmation.
4. Artifact cache metadata must match requested repo, skill path, tag, and 40-hex SHA before reuse/activation. Reject unsafe/malformed commit SHA and redirecting metadata.
5. Track successful metadata checks and negative-cache failures per session, including after lock wait, so a session does not repeatedly refresh the same source. Preserve stale verified fallback.
6. Create session/cache dirs with restrictive permissions appropriate for private global state; add tests through the filesystem abstraction where possible.
7. Validate catalog sources against the approved GitHub allowlist and reject unsafe traversal/absolute `skillPath` values.
8. Add integration coverage for the real disk composition lifecycle, including install/update/clean behavior and no dormant skill leakage.

## Scope discipline

Preserve tgrep as the repository-search command and keep RTK out of tgrep rewriting. Preserve existing unrelated PDF/JSON files. Keep protocol DI; no owned-module mocking.

## Verification

For each fix, write failing tests first. Run focused tests, full `bun run test -- --run`, `bun run typecheck`, `bun run build`, `git diff --check`, and verify the remote ref. Commit logical conventional commits and append a complete report to `.superpowers/sdd/final-hardening-report.md`.
