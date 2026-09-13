# Task 4 second review fixes

Address both findings from the latest Task 4 review with regression tests first.

## Required fixes

1. Make lock release/stale-reclaim ownership-safe at the filesystem boundary. An old lease or stale reclaimer must not delete a replacement lock after a read/delete race. Prefer an atomic OS-backed ownership operation or redesign the lock representation so the lease token is part of the atomically removed path. The `FileSystem` protocol contract must state the safety guarantee and the Node adapter must implement it honestly.
2. Re-check per-session negative-cache state after acquiring the lock, so queued same-session waiters do not retry a known failed refresh.

Add tests that exercise the replacement-lock race and queued same-session failure path. Run focused/full tests, typecheck, build, and diff check. Commit a conventional `fix:` commit and append verification to `.superpowers/sdd/task-4-report.md`. Preserve unrelated Task 5/6/7/8/10 files.
