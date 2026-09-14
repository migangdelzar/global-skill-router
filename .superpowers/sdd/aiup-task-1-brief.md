# AIUP Task 1: Add the core requirements baseline

Read the approved plan at `docs/superpowers/plans/2026-09-13-aiup-core-baseline.md` first.

Implement one catalog change:

- Extend `SkillEntry` with required `preinstalled: boolean`.
- Validate the field in `parseCatalog`; missing/non-boolean values must name `preinstalled` in `CatalogValidationError`.
- Add exactly six AIUP baseline entries to `catalog/catalog.yaml`, all with `source: AI-Unified-Process/marketplace`, `preinstalled: true`, `release_policy: latest-stable-tag`, and paths under `aiup-core/skills/`:
  `requirements`, `reverse-engineer`, `entity-model`, `use-case-diagram`, `use-case-spec`, `test-case`.
- Use `activation: automatic` only for requirements and reverse-engineer. Use `explicit` for the other four.
- Extend the source allowlist to permit exactly `AI-Unified-Process/marketplace`; retain all existing safety checks and release-only fail-closed behavior.
- Update catalog/router tests for parsing, auto-routing, downstream non-auto-routing, and missing field validation.
- Update `docs/INSTALL.md`, `docs/USAGE.md`, and `tasks/todo.md` to state that AIUP is baseline catalog intent but remains dormant/release-gated; do not install Context7 MCP.

Required TDD tests:

```ts
it('parses preinstalled AIUP entries with their exact source and skill paths', () => {
  const skills = parseCatalog(aiupCatalogYaml);
  expect(skills.filter((skill) => skill.id.startsWith('aiup-'))).toHaveLength(6);
  expect(skills.every((skill) => skill.preinstalled)).toBe(true);
  expect(skills.every((skill) => skill.source === 'AI-Unified-Process/marketplace')).toBe(true);
});

it('routes requirements and brownfield tasks to AIUP automatic skills', () => {
  expect(route({ task: 'turn this vision into measurable requirements' }, skills).primary?.id)
    .toBe('aiup-requirements');
  expect(route({ task: 'reverse engineer this existing application' }, skills).primary?.id)
    .toBe('aiup-reverse-engineer');
});

it('does not auto-route downstream AIUP skills', () => {
  const result = route({ task: 'model entities and draw use cases' }, skills);
  expect(result.primary?.id).not.toBe('aiup-entity-model');
  expect(result.primary?.id).not.toBe('aiup-use-case-diagram');
});

it('rejects a catalog entry without the preinstalled boolean', () => {
  expect(() => parseCatalog(missingPreinstalled)).toThrow(/preinstalled/);
});
```

Use existing test helpers/conventions and define fixtures in the tests. Do not modify PDF/JSON files, global AGENTS/Caveman/Superpowers/tgrep/RTK behavior, or download any AIUP source. Run focused tests, full `bun run test -- --run`, `bun run typecheck`, `bun run build`, and `git diff --check`.

Commit logical changes with `feat: add AIUP core requirements baseline` and write the full verification report to `.superpowers/sdd/aiup-task-1-report.md`.
