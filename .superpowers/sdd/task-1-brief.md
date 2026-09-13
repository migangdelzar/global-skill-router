# Task 1: Bootstrap the TypeScript project and protocols

**Files:**

- Create: `package.json`
- Create: `tsconfig.json`
- Create: `vitest.config.ts`
- Create: `src/ports/clock.ts`
- Create: `src/ports/filesystem.ts`
- Create: `src/ports/github.ts`
- Create: `src/ports/lock.ts`
- Create: `src/index.ts`
- Create: `tests/fixtures/fakes.ts`
- Test: `tests/unit/protocols.test.ts`

Build a Node.js 20 / TypeScript 5 ESM project using Vitest and strict type checking. Define these protocols:

```ts
export interface Clock {
  now(): Date;
  random(): number;
}

export interface FileSystem {
  exists(path: string): Promise<boolean>;
  readText(path: string): Promise<string>;
  writeText(path: string, content: string): Promise<void>;
  mkdir(path: string): Promise<void>;
  remove(path: string): Promise<void>;
  rename(from: string, to: string): Promise<void>;
  copyTree(from: string, to: string): Promise<void>;
}

export interface GitHubClient {
  listReleases(repo: string): Promise<ReadonlyArray<GitHubRelease>>;
  resolveTag(repo: string, tag: string): Promise<{ commitSha: string }>;
  downloadTagArchive(repo: string, tag: string): Promise<Uint8Array>;
}

export interface SourceLock {
  acquire(key: string, owner: string, timeoutMs: number): Promise<LockLease>;
}

export interface LockLease {
  release(): Promise<void>;
}
```

The `GitHubRelease` type may be declared in the GitHub port for this bootstrap task. Shared fakes must be injectable and record calls; do not use `vi.mock()` for owned modules.

- [ ] **Step 1: Write the failing test**

Write `tests/unit/protocols.test.ts` with a fake clock, in-memory filesystem, GitHub client, and lock that satisfy each protocol and record calls.

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- --run tests/unit/protocols.test.ts`

Expected: FAIL because the protocol and fake modules do not exist.

- [ ] **Step 3: Write minimal implementation**

Add the protocol declarations, package scripts (`test`, `typecheck`, `build`), strict compiler settings, and the smallest fakes needed by later tests.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- --run tests/unit/protocols.test.ts && npm run typecheck`

Expected: PASS with zero failures and zero TypeScript errors.

- [ ] **Step 5: Commit**

```bash
git add package.json tsconfig.json vitest.config.ts src tests
git commit -m "chore: bootstrap skill router project"
```

## Global constraints

- Do not modify the existing PDF/JSON files.
- Use protocol-based dependency injection.
- Keep this task limited to project bootstrap, ports, and fakes.
- Implement tests before production declarations/implementations.

## Report

Write a report to `.superpowers/sdd/task-1-report.md` containing status, commit hash, tests run with results, changed files, and concerns. Return only a short summary after writing the report.
