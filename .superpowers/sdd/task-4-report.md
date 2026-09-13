# Task 4 Report: Prevent Metadata Cache Stampedes

## Status

Complete.

## Commit

`feat: prevent metadata cache stampedes`

## Changed files

- `src/domain/cache.ts`
- `src/services/metadata-cache.ts`
- `src/services/source-lock.ts`
- `src/index.ts`
- `tests/unit/metadata-cache.test.ts`
- `tests/unit/source-lock.test.ts`

## Behavior implemented

- Reads fresh verified metadata without calling the release resolver.
- Refreshes stale metadata under a per-repository single-flight lock.
- Rechecks freshness after lock acquisition so concurrent callers reuse the first refresh.
- Uses a 24-hour TTL with bounded ±1-hour jitter from the injected clock randomness.
- Persists metadata through a unique temporary file followed by atomic rename.
- Reclaims locks whose age reaches the configured timeout.
- Returns stale verified metadata when GitHub refresh fails.
- Raises an actionable error when no verified metadata exists and the first refresh fails.

## TDD evidence

- Red: focused tests failed before implementation because `src/domain/cache.js` and `src/services/source-lock.js` were missing.
- Green: focused suite passed with 9/9 tests.
- Refactor: lock state and jitter handling were simplified without changing behavior; focused tests remained 9/9.

## Verification

- `npm test -- --run tests/unit/metadata-cache.test.ts tests/unit/source-lock.test.ts` — PASS, 9/9.
- `npm run typecheck` — PASS.
- `npm test -- --run` — PASS, 40/40.
- `git diff --check` — PASS.

The repository has no configured `origin`, so this commit could not be pushed. PDF/JSON data files and RTK/global files were not modified.

## Review-fix verification

- Added filesystem-backed exclusive lock files with owner, PID, session ID, creation timestamp, and unique token metadata.
- Added token-checked atomic removal semantics so stale reclamation and old leases cannot remove a replacement lock.
- Added bounded polling with timeout rechecks so waiters reclaim crashed holders.
- Added per-session negative caching for failed refreshes while retaining stale verified metadata fallback.
- Added exact requested-repository validation for cached metadata.
- `npm test -- --run tests/unit/source-lock.test.ts tests/unit/metadata-cache.test.ts` — PASS, 14/14.
- `npm run typecheck` — PASS.
- `npm run build` — PASS.
- `git diff --check` — PASS.
- Full suite: 57/58 passed; the only failure is the unrelated pre-existing Task 10 `ToolReleaseManager` checksum fixture (`tgrep-aarch64-apple-darwin.tar.gz`).
- PDF/JSON data files and global/RTK files were not modified. No remote is configured, so the commit cannot be pushed.

## Second review-fix verification

- Replaced racy content-conditional lock deletion with an ownership-safe lock directory: each lease owns a unique token file path, and release/reclaim removes only that exact file before attempting an empty-directory removal.
- Extended the `FileSystem` contract with exclusive directory creation, exact-file removal, and empty-directory removal; the Node adapter uses `mkdir`, `unlink`, and `rmdir` semantics that do not read then conditionally delete a shared lock path.
- Added a regression test that rejects the old unsafe removal API while exercising stale reclaim, replacement ownership, and old-lease release.
- Added a regression test proving same-session waiters re-check negative-cache state after acquiring the lock and do not retry a failed refresh.
- `npm test -- --run tests/unit/source-lock.test.ts tests/unit/metadata-cache.test.ts` — PASS, 16/16.
- `npm run typecheck` — PASS.
- `npm run build` — PASS.
- `npm test -- --run` — PASS, 65/65.
- `git diff --check` — PASS.

## Third review-fix verification

- Replaced the shared lock-directory publication gap with a permanent per-repository claims directory and unique atomically-created claim files.
- Claim filenames include the owner and unique process/token data; contenders select the lexicographically smallest visible claim deterministically.
- Stale reclaim and lease release remove only the exact claim path, so an old lease cannot remove replacement ownership.
- Preserved owner, PID, session ID, creation timestamp, and token metadata in every claim.
- Added a delayed-filesystem contention regression that holds the first claim operation after atomic file creation and verifies no shared exclusive-directory primitive is used.
- Red: the regression failed against the prior implementation because it called `createExclusiveDirectory`.
- Green: `npm test -- --run tests/unit/source-lock.test.ts tests/unit/metadata-cache.test.ts` — PASS, 17/17.
- Full verification: `npm run typecheck`, `npm run build`, `npm test -- --run` — PASS, 66/66; `git diff --check` — PASS.
- Commit: `0f901f8 fix: harden filesystem lock races`.
- Only Task 4 lock/fixture/port/adapter/test files and this report were changed; unrelated Task 5/6/7/8/10 work was preserved.
