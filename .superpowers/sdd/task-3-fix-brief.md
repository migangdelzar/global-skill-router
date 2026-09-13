# Task 3 review fix

Address review finding F-01 with strict TDD.

`src/services/release-resolver.ts` must validate the result of `resolveTag`:

- `null`, missing fields, non-strings, branch names, short values, and non-hex values are malformed.
- Accept only a 40-character hexadecimal commit SHA.
- Throw the existing `MalformedReleaseError` with an actionable message.
- Add focused regression tests before implementation and retain all existing behavior.

Run the focused resolver tests, full test suite, typecheck, build, and diff check. Commit the fix and append the verification to `.superpowers/sdd/task-3-report.md`. Do not touch PDF/JSON or RTK/global files.
