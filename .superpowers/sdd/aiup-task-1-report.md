# AIUP Task 1 Report

## Result

Added the six AIUP core baseline entries as preinstalled catalog intent:

- `aiup-requirements` — automatic
- `aiup-reverse-engineer` — automatic
- `aiup-entity-model` — explicit
- `aiup-use-case-diagram` — explicit
- `aiup-use-case-spec` — explicit
- `aiup-test-case` — explicit

All entries use source `AI-Unified-Process/marketplace`, paths under
`aiup-core/skills/`, `preinstalled: true`, and
`release_policy: latest-stable-tag`.

Extended `SkillEntry` and `parseCatalog` so `preinstalled` is required and must
be boolean. The AIUP source is accepted by the existing safe GitHub source
validation. Requirements and brownfield work route automatically; downstream
AIUP skills remain explicit and dormant.

Updated existing test fixtures for the required schema field and documented that
AIUP remains release-gated and that Context7 MCP is not installed. Existing
Caveman, Superpowers, tgrep, RTK, PDF, and JSON behavior was not changed.

## TDD Evidence

1. Added catalog/router tests before implementation.
2. RED verification:
   `bun run test -- --run tests/unit/catalog.test.ts tests/unit/skill-router.test.ts`
   produced 2 expected failures: missing `preinstalled` was not yet validated.
3. GREEN verification passed after schema and catalog implementation.
4. Updated integration fixtures required by the schema contract and reran all
   checks successfully.

## Verification

- Focused tests: `30 passed` (`tests/unit/catalog.test.ts`, `tests/unit/skill-router.test.ts`)
- Full suite: `115 passed`, `15 test files passed`
- Typecheck: `bun run typecheck` passed
- Build: `bun run build` passed
- Diff validation: `git diff --check` passed
- No AIUP source downloaded
- No Context7 MCP installed
- Existing PDF/JSON files remain untouched and unstaged

## Files Changed

- `src/domain/catalog.ts`
- `catalog/catalog.yaml`
- `tests/unit/catalog.test.ts`
- `tests/unit/skill-router.test.ts`
- `tests/integration/cli.test.ts`
- `tests/integration/end-to-end.test.ts`
- `docs/INSTALL.md`
- `docs/USAGE.md`
- `tasks/todo.md`
