# AIUP source allowlist review fix

Address review finding F-01 with strict TDD.

Replace syntactic-only GitHub source validation with an explicit reviewed
allowlist containing every existing approved catalog source plus exactly
`AI-Unified-Process/marketplace`. Reject a syntactically valid but unreviewed
source. Add regression coverage in the catalog tests. Preserve all existing
entries, AIUP routing, release-only fail-closed behavior, and docs.

Run focused catalog/router tests, full `bun run test -- --run`, typecheck, build,
diff check, and remote parity. Commit a conventional `fix:` commit and append
verification to `.superpowers/sdd/aiup-task-1-report.md`. Do not modify PDF/JSON.
