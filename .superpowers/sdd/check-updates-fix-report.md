# `check-updates` Fix Report

## Scope

Implemented the documented `skill-router check-updates` command through the
CLI dependency-injection boundary. It resolves latest stable release metadata
for approved catalog entries, emits deterministic human-readable output, and
does not download artifacts or activate/mutate session skill directories.

Install and update confirmation behavior remains unchanged.

## TDD Evidence

1. Added focused CLI and disk-composition tests first.
2. Red: affected tests failed because `check-updates` was not routed; 10 existing
   affected tests passed and 2 new tests failed at the expected command result.
3. Green: added the injected `checkUpdates` callback, deterministic formatter,
   and metadata-only disk composition.
4. Green verification: affected tests passed, 12/12.

## Changes

- `src/cli/main.ts`
  - Added `SkillUpdate` and `checkUpdates` DI contracts.
  - Added `check-updates` command routing and error handling.
  - Sorted results by skill ID before formatting.
  - Wired disk mode to `MetadataCacheService` only; duplicate sources resolve once.
- `tests/integration/cli.test.ts`
  - Covers session forwarding and deterministic release output.
- `tests/integration/end-to-end.test.ts`
  - Covers release metadata lookup without archive download or active-session
    activation.
- `docs/USAGE.md`
  - Documents the command.

## Verification

- `bun run test -- --run tests/integration/cli.test.ts tests/integration/end-to-end.test.ts` — 12/12 passed
- `bun run test -- --run` — 102/102 passed
- `bun run typecheck` — passed
- `bun run build` — passed
- `git diff --check` — passed
- PDF/JSON files — untouched
- Remote parity — verified after commit
