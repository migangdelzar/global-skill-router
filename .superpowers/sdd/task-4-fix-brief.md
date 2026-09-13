# Task 4 review fixes

Address all Task 4 review findings with regression tests first.

## Required fixes

1. Replace process-local locking with filesystem-backed exclusive lock files so separate router processes cannot refresh the same repo concurrently. Lock metadata must include owner/PID/session/timestamp; stale locks must be reclaimable.
2. Waiting lock holders must re-check bounded timeout and reclaim/continue if the original holder crashes; no waiter may hang forever.
3. Use `sessionId` for per-session negative caching so repeated failed refreshes within a session do not cause retry storms. Preserve stale verified metadata fallback.
4. Validate that a cached metadata record's `repo` exactly matches the requested repo before returning it.

Keep protocol-based DI and existing behavior. Do not overwrite or revert unrelated Task 5/6 work. Run focused/full tests, typecheck, build, and diff check. Commit with a conventional `fix:` message and append verification to `.superpowers/sdd/task-4-report.md`.
