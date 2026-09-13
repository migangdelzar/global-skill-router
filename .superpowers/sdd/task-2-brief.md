# Task 2: Parse the catalog and select a route

## Objective

Implement catalog parsing and deterministic skill routing from the approved plan.

## Scope

- Create `src/domain/catalog.ts`.
- Create `src/services/skill-router.ts`.
- Create `catalog/catalog.yaml` with the approved preferred skills and routing metadata.
- Create focused tests in `tests/unit/catalog.test.ts` and `tests/unit/skill-router.test.ts`.

## Required contracts

```ts
export type ActivationMode = "automatic" | "explicit";

export interface SkillEntry {
  id: string;
  category: string;
  source: string;
  skillPath: string;
  useWhen: readonly string[];
  activation: ActivationMode;
  conflictsWith: readonly string[];
  requires: readonly string[];
  releasePolicy: "latest-stable-tag";
}

export interface RouteRequest {
  task: string;
  explicitSkillId?: string;
  projectInstructions?: string;
}

export interface RouteResult {
  primary: SkillEntry | null;
  adjuncts: readonly SkillEntry[];
  rejected: readonly { id: string; reason: string }[];
}

export function route(request: RouteRequest, skills: readonly SkillEntry[]): RouteResult;
```

## Acceptance tests

1. Explicit `apple-design` beats automatic `emil-design-eng`.
2. A task mentioning animation selects `emil-design-eng`.
3. `taste` is not selected without a website-analysis trigger.
4. Conflicting workflow packs are rejected unless explicitly selected.
5. At most one primary, one adjunct, and one reviewer are returned.
6. Malformed catalog entries are rejected with the field name in the error.

## TDD and verification

Write tests first and prove the focused tests fail before implementation. Then implement the minimum behavior, refactor, and run:

```bash
npm test -- --run tests/unit/catalog.test.ts tests/unit/skill-router.test.ts
npm run typecheck
```

Commit all task files with:

```text
feat: add catalog routing policy
```

Do not modify the existing PDF/JSON files or any RTK/global files. Report commit, files, tests, and concerns in `.superpowers/sdd/task-2-report.md`.
