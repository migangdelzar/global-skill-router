# Session object-path security fix

Address the final review finding with strict TDD.

`SessionManager.activate` must never trust `artifact.objectPath`. Derive the
expected immutable object path from the configured cache root plus the validated
repo, selected skillPath, release tag, and 40-hex commit SHA (using the same
canonical cache-key logic as artifact cache). Verify the artifact metadata and
the derived path agree, and reject traversal, absolute paths, separators, or
outside-root paths before any copy. Add a regression test passing a valid-looking
artifact whose objectPath points outside the cache root.

Run focused/full Bun tests, typecheck, build, diff check, and remote parity.
Commit a conventional `fix:` commit and append `.superpowers/sdd/session-path-fix-report.md`.
Do not modify PDF/JSON or unrelated behavior.
