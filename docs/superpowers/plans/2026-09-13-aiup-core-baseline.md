# AIUP Core Baseline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Register Simon Martinelli's six stack-agnostic AIUP core skills as preinstalled-but-router-controlled global defaults.

**Architecture:** Extend the catalog schema with an explicit `preinstalled` flag and add six `aiup-core` entries. Requirements and brownfield reverse engineering may route automatically; modeling, use-case, and test-case skills remain explicit downstream steps. The release resolver remains authoritative, so the catalog can be present before upstream publishes a stable GitHub Release without downloading unsafe source.

**Tech Stack:** TypeScript 5 ESM, Bun 1.4.x, Vitest, existing catalog parser/router, native GitHub release policy.

## Global Constraints

- Only the newest stable GitHub Release tag is installable.
- `AI-Unified-Process/marketplace` has no stable GitHub Release currently; fail closed until one exists.
- All six AIUP entries use `aiup-core/skills/<name>` paths and `preinstalled: true`.
- Only `aiup-requirements` and `aiup-reverse-engineer` are automatic; downstream AIUP skills are explicit.
- AIUP skills remain outside active discovery until selected; no bundled Context7 MCP is installed.
- Existing Caveman, Superpowers, `tgrep`, RTK, PDF, and JSON behavior remains unchanged.

---

### Task 1: Add the AIUP core baseline catalog entries

**Files:**

- Modify: `src/domain/catalog.ts`
- Modify: `catalog/catalog.yaml`
- Modify: `tests/unit/catalog.test.ts`
- Modify: `tests/unit/skill-router.test.ts`
- Modify: `docs/INSTALL.md`
- Modify: `docs/USAGE.md`
- Modify: `tasks/todo.md`

**Interfaces:**

```ts
export interface SkillEntry {
  id: string;
  category: string;
  source: string;
  skillPath: string;
  useWhen: readonly string[];
  activation: ActivationMode;
  preinstalled: boolean;
  conflictsWith: readonly string[];
  requires: readonly string[];
  releasePolicy: 'latest-stable-tag';
}
```

The catalog must contain exactly these baseline entries:

```yaml
- id: aiup-requirements
  category: requirements
  source: AI-Unified-Process/marketplace
  skill_path: aiup-core/skills/requirements
  use_when: [requirements, vision, acceptance criteria, ambiguity]
  activation: automatic
  preinstalled: true
  conflicts_with: []
  requires: []
  release_policy: latest-stable-tag
- id: aiup-reverse-engineer
  category: requirements
  source: AI-Unified-Process/marketplace
  skill_path: aiup-core/skills/reverse-engineer
  use_when: [reverse engineer, brownfield, existing application]
  activation: automatic
  preinstalled: true
  conflicts_with: []
  requires: []
  release_policy: latest-stable-tag
- id: aiup-entity-model
  category: requirements-modeling
  source: AI-Unified-Process/marketplace
  skill_path: aiup-core/skills/entity-model
  use_when: [entity model, domain model, data model]
  activation: explicit
  preinstalled: true
  conflicts_with: []
  requires: []
  release_policy: latest-stable-tag
- id: aiup-use-case-diagram
  category: requirements-modeling
  source: AI-Unified-Process/marketplace
  skill_path: aiup-core/skills/use-case-diagram
  use_when: [use case diagram, system use cases, actors]
  activation: explicit
  preinstalled: true
  conflicts_with: []
  requires: []
  release_policy: latest-stable-tag
- id: aiup-use-case-spec
  category: requirements
  source: AI-Unified-Process/marketplace
  skill_path: aiup-core/skills/use-case-spec
  use_when: [use case specification, main success scenario, alternative flow]
  activation: explicit
  preinstalled: true
  conflicts_with: []
  requires: []
  release_policy: latest-stable-tag
- id: aiup-test-case
  category: requirements-testing
  source: AI-Unified-Process/marketplace
  skill_path: aiup-core/skills/test-case
  use_when: [test case, user journey, acceptance journey]
  activation: explicit
  preinstalled: true
  conflicts_with: []
  requires: []
  release_policy: latest-stable-tag
```

- [ ] **Step 1: Write the failing tests**

Add tests that assert:

```ts
const aiupCatalogYaml = `
skills:
  - id: aiup-requirements
    category: requirements
    source: AI-Unified-Process/marketplace
    skill_path: aiup-core/skills/requirements
    use_when: [requirements]
    activation: automatic
    preinstalled: true
    conflicts_with: []
    requires: []
    release_policy: latest-stable-tag
`;
const skills = parseCatalog(aiupCatalogYaml);
const missingPreinstalled = aiupCatalogYaml.replace('preinstalled: true\n', '');

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

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun run test -- --run tests/unit/catalog.test.ts tests/unit/skill-router.test.ts`

Expected: FAIL because the schema has no `preinstalled` field and the six entries are absent.

- [ ] **Step 3: Write minimal implementation**

Add `preinstalled` to the TypeScript contract and parser validation. Add the six entries with `activation: automatic` only for requirements and reverse-engineer; use `explicit` for the remaining four. Extend the GitHub allowlist to permit exactly `AI-Unified-Process/marketplace`, while retaining the existing no-release fail-closed behavior.

- [ ] **Step 4: Run tests to verify they pass**

Run:

```bash
bun run test -- --run tests/unit/catalog.test.ts tests/unit/skill-router.test.ts
bun run typecheck
bun run build
git diff --check
```

Expected: focused tests pass, typecheck/build succeed, and diff check is clean.

- [ ] **Step 5: Update docs and commit**

Document that AIUP core is globally cataloged/preinstalled in intent but remains dormant and release-gated because the official marketplace has no stable GitHub Release. Commit:

```bash
git add src/domain/catalog.ts catalog/catalog.yaml tests/unit/catalog.test.ts tests/unit/skill-router.test.ts docs/INSTALL.md docs/USAGE.md tasks/todo.md
git commit -m "feat: add AIUP core requirements baseline"
```

## Verification checklist

- [ ] Six exact AIUP entries exist and parse with `preinstalled: true`.
- [ ] Requirements and reverse-engineer route automatically only on matching tasks.
- [ ] Downstream model/use-case/test skills remain explicit/dormant.
- [ ] No install attempts a branch or raw commit when no stable Release exists.
- [ ] `bun run test -- --run` passes with zero failures.
- [ ] `bun run typecheck` and `bun run build` pass.
- [ ] Existing Caveman/Superpowers/tgrep/RTK behavior remains unchanged.
- [ ] Existing PDF/JSON files remain unstaged.
