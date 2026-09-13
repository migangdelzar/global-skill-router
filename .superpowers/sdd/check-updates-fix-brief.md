# CLI check-updates fix

Implement the documented `skill-router check-updates` command with strict TDD.

It must be wired through the CLI dependency-injection boundary, inspect the
approved catalog/release metadata without downloading or mutating active
sessions, and return a deterministic human-readable result. Preserve explicit
confirmation for install/update. Add focused CLI tests, run full Bun test,
typecheck, build, diff check, and remote parity. Commit a conventional `fix:`
commit and write `.superpowers/sdd/check-updates-fix-report.md`. Do not modify
PDF/JSON or unrelated behavior.
