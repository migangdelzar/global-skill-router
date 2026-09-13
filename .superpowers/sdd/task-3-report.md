# Task 3 Report: Resolve Stable GitHub Releases Only

## Status

Complete.

## Commit

`feat: resolve stable GitHub releases only`

## Implementation

- Added `src/domain/version.ts` with `GitHubRelease`, `ResolvedRelease`, `ReleaseResolver`, `NoStableReleaseError`, and `MalformedReleaseError`.
- Added `src/services/release-resolver.ts` with injected `GitHubClient` and `Clock` dependencies.
- The resolver validates the release response, filters out drafts and prereleases, sorts by `publishedAt` descending, resolves exactly one selected tag to a commit SHA, and returns the resolution timestamp.
- Updated `src/ports/github.ts` to use the shared domain release contract.
- Added `tests/unit/release-resolver.test.ts` covering all five acceptance behaviors.
- Resolution never calls `downloadTagArchive` and has no branch, `main`, `master`, or untagged fallback.

## TDD Evidence

- Red: the focused suite failed before implementation because `src/domain/version.js` and the resolver module did not exist.
- Green: `npm test -- --run tests/unit/release-resolver.test.ts` — PASS, 5/5 tests.
- Direct source verification: TypeScript check for the Task 3 domain, service, and ports — PASS.

## Repository Verification

- `npm test -- --run` — Task 3 tests pass; two pre-existing Task 2 suites fail because `src/domain/catalog.js` and `src/services/skill-router.js` are not implemented yet.
- `npm run typecheck` and `npm run build` — blocked by those same missing Task 2 modules/tests; no Task 3 source errors remain.
- `git diff --check` — PASS.

## Scope Notes

- Existing PDF/JSON files were not modified.
- RTK and global configuration files were not modified.
- No remote is configured for this repository, so no push was possible.
