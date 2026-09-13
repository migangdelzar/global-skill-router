# Task 4 third review fix

Fix the remaining High lock race with regression tests first.

The current fixed lock directory is created before its token file. A stale
reclaimer can remove that empty directory while a new owner is publishing its
token, allowing two owners. Redesign the filesystem lock so ownership is
represented by an atomically created, unique token path under a stable claims
directory (or an equivalently safe OS primitive). Concurrent claims must be
resolved deterministically; stale claims can be removed by their unique path;
old leases must never delete replacement ownership. Preserve owner/PID/session/
timestamp metadata and add a delayed-filesystem regression test for the gap.

Run focused/full tests, typecheck, build, and diff check. Commit a conventional
`fix:` commit and update `.superpowers/sdd/task-4-report.md`. Preserve unrelated
Task 5/6/7/8/10 work.
