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

## Review Fix: Validate Resolved Commit SHA

- Added regression coverage for null, missing, non-string, branch-name, short, and non-hex `resolveTag` payloads.
- The resolver now validates the runtime payload before dereferencing it and accepts only a 40-character hexadecimal commit SHA.
- Invalid payloads consistently throw `MalformedReleaseError` with an actionable validation message.
- Red: the focused suite failed 6/11 new cases before the implementation because invalid payloads were dereferenced, accepted, or produced the wrong error.
- Green: `npm test -- --run tests/unit/release-resolver.test.ts` — PASS, 11/11 tests.
- Full verification: `npm test -- --run` — PASS, 31/31 tests; `npm run typecheck` — PASS; `npm run build` — PASS; `git diff --check` — PASS.

## Scope Notes

- Existing PDF/JSON files were not modified.
- RTK and global configuration files were not modified.
- No remote is configured for this repository, so no push was possible.
