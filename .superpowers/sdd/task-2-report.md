# Task 2 Report: Parse the Catalog and Select a Route

## Status

Complete.

## Commit

`feat: add catalog routing policy`

## Implementation

- Added `src/domain/catalog.ts` with YAML/JSON catalog parsing, normalized keys, immutable entries, and field-specific validation errors.
- Added `src/services/skill-router.ts` with deterministic explicit/project/task priority, conflict rejection, primary/adjunct/reviewer caps, and RTK tooling metadata.
- Added `catalog/catalog.yaml` with the approved UI, codebase, and RTK routing metadata.
- Added focused catalog and router tests, including the RTK behavior present in the workspace tests.
- Exported Task 2 contracts from `src/index.ts`.

## TDD and verification

- Red: focused suites failed because `src/domain/catalog.js` and `src/services/skill-router.js` did not exist.
- Green: focused suites passed, 10/10 tests.
- Refactor: validation narrowing, project-instruction priority, parser cleanup, and public exports completed while green.
- `npm test -- --run tests/unit/catalog.test.ts tests/unit/skill-router.test.ts` — PASS, 10/10.
- `npm run typecheck` — PASS.
- `npm run build` — PASS.
- `npm test -- --run` — PASS, 20/20.
- `git diff --check` — PASS.

## Scope and concerns

- No RTK binary, RTK config, global file, PDF, or JSON file was modified.
- RTK is represented only as route metadata: `tgrep` remains the repository search command, and RTK is selected for noisy CLI work unless exact/raw output is requested.
- The parser intentionally supports the committed catalog YAML subset without adding a dependency; a general-purpose YAML parser may be preferable if future catalog syntax expands.
- The repository has no configured `origin`, so this local commit could not be pushed.

## Review Fixes

Addressed all High/Medium findings from `task-2-fix-brief.md`:

- Replaced substring matching with token-boundary phrase matching, so generic categories such as `ui` cannot match inside words such as `build`.
- Removed the duplicate `rtk-cli-filter` catalog entry and added duplicate-ID validation.
- Preserved catalog roles for explicitly and project-forced skills; precedence now affects ordering only.
- Made unknown explicit skill IDs fail closed without selecting an automatic route.
- Normalized snake_case keys recursively for JSON catalog input.
- Removed the duplicate unchecked Task 2 commit step from the implementation plan.

## Review-Fix TDD and Verification

- Red: added five regression tests; all five failed for the reported defects while the existing Task 2 tests remained green.
- Green: focused Task 2 suites — PASS, 15/15.
- Full suite: `npm test -- --run` — PASS, 25/25.
- `npm run typecheck` — PASS.
- `npm run build` — PASS.
- `git diff --check` — PASS.

## Review-Fix Commits

- `fix: address Task 2 routing review findings`
- `docs: record Task 2 review fixes`
