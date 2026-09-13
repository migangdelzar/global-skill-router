# Global Skill Router Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a global Codex skill router that selects approved optional skills, installs only stable GitHub Release tags, prevents cache stampedes, and deletes per-session activation state.

**Architecture:** A TypeScript 5 ESM CLI owns pure routing/version logic and injected filesystem, GitHub, clock, lock, and archive dependencies. The CLI stores immutable verified release objects in a persistent cache, materializes selected skills into a session directory, and keeps dormant sources outside Codex's active discovery path. A short `SKILL.md` delegates task selection to the CLI/catalog.

**Tech Stack:** Node.js 20 LTS, TypeScript 5.x, ESM, Vitest, native `fetch`, native `crypto`, native filesystem APIs, and the system `tar` command for GitHub tarballs.

## Global Constraints

- Only the newest stable GitHub Release tag is installable.
- Branches, default branches, untagged commits, drafts, and prereleases are rejected.
- Shared cache objects are immutable and addressed by repository, skill path, and resolved commit SHA.
- Metadata refresh is limited to once per source per session and has a 24-hour TTL with bounded jitter.
- Concurrent refreshes use one lock per repository/skill source.
- Session activation state is disposable; shared verified release objects persist.
- Dormant skills must not be placed under `~/.agents/skills/`.
- User-selected skills and project `AGENTS.md` rules take precedence over automatic routing.
- No GitHub download or skill script execution occurs without explicit install/update confirmation.
- Existing PDF/JSON files in the workspace are unrelated and must remain unstaged.

---

## 1. Files and Responsibilities

```text
package.json                         Project scripts and dependencies
tsconfig.json                        Strict ESM TypeScript build
vitest.config.ts                     Vitest configuration
src/domain/catalog.ts                Catalog types, parsing, and conflict selection
src/domain/version.ts                Release/tag/SHA policy and version comparison
src/domain/cache.ts                  Cache keys, metadata freshness, and cache state
src/domain/session.ts                Session paths and cleanup policy
src/ports/clock.ts                   Injectable time/randomness protocol
src/ports/filesystem.ts              Injectable filesystem protocol
src/ports/github.ts                  GitHub release/tag/download protocol
src/ports/lock.ts                    Per-source lock protocol
src/services/release-resolver.ts     Stable-release resolution
src/services/metadata-cache.ts       TTL, jitter, and single-flight metadata refresh
src/services/artifact-cache.ts       Download, checksum, and atomic publication
src/services/session-manager.ts      Session activation and cleanup
src/services/skill-router.ts         Task classification and route policy
src/ports/tooling.ts                 Runtime-tool release protocol
src/services/tool-release-manager.ts RTK asset install, verification, and rollback
src/cli/main.ts                      CLI command composition root
src/index.ts                         Public exports for tests and CLI
bin/skill-router.mjs                 Built CLI launcher
catalog/catalog.yaml                 Approved skill metadata and sources
skill/SKILL.md                       Small global router skill
scripts/bootstrap-global.mjs         Installs router/catalog into global paths
tests/fixtures/fakes.ts              Shared protocol fakes
tests/unit/*.test.ts                  Unit tests for every service
tests/integration/*.test.ts           Real temporary-directory lifecycle tests
docs/INSTALL.md                      Global setup and update behavior
docs/USAGE.md                        Routing commands and examples
docs/RTK.md                           Global RTK install, update, and rollback behavior
```

## 2. Task List

### Task 1: Bootstrap the TypeScript project and protocols

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

**Interfaces:**

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

- [x] **Step 1: Write the failing test**

Write `tests/unit/protocols.test.ts` with a fake clock, in-memory filesystem, GitHub client, and lock that satisfy each protocol and record calls.

- [x] **Step 2: Run test to verify it fails**

Run: `npm test -- --run tests/unit/protocols.test.ts`

Expected: FAIL because the protocol and fake modules do not exist.

- [x] **Step 3: Write minimal implementation**

Add the protocol declarations, package scripts (`test`, `typecheck`, `build`), strict compiler settings, and the smallest fakes needed by later tests.

- [x] **Step 4: Run test to verify it passes**

Run: `npm test -- --run tests/unit/protocols.test.ts && npm run typecheck`

Expected: PASS with zero failures and zero TypeScript errors.

- [x] **Step 5: Commit**

```bash
git add package.json tsconfig.json vitest.config.ts src tests
git commit -m "chore: bootstrap skill router project"
```

### Task 2: Parse the catalog and select a route

**Files:**

- Create: `src/domain/catalog.ts`
- Create: `src/services/skill-router.ts`
- Create: `catalog/catalog.yaml`
- Test: `tests/unit/catalog.test.ts`
- Test: `tests/unit/skill-router.test.ts`

**Interfaces:**

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

- [x] **Step 1: Write the failing tests**

Cover:

1. Explicit `apple-design` beats automatic `emil-design-eng`.
2. A task mentioning animation selects `emil-design-eng`.
3. `taste` is not selected without a website-analysis trigger.
4. Conflicting workflow packs are rejected unless explicitly selected.
5. At most one primary, one adjunct, and one reviewer are returned.
6. Malformed catalog entries are rejected with the field name in the error.
7. Repository-search routing always returns `tgrep` and excludes it from RTK rewriting.
8. CLI-heavy tasks select the RTK tooling adjunct; exact raw-output requests disable it.

- [x] **Step 2: Run tests to verify they fail**

Run: `npm test -- --run tests/unit/catalog.test.ts tests/unit/skill-router.test.ts`

Expected: FAIL because catalog parsing and routing are not implemented.

- [x] **Step 3: Write minimal implementation**

Implement the parser for the committed catalog and deterministic keyword matching. Apply priority in this order: explicit skill, project instructions, exact category/trigger match, then no optional skill.

Keep tooling routing separate from the primary/adjunct skill slots: `tgrep` is a
mandatory repository-search command policy, while `rtk-cli-filter` is an
optional automatic CLI-output adjunct. Do not create a global `rg` symlink.

- [x] **Step 4: Run tests to verify they pass**

Run: `npm test -- --run tests/unit/catalog.test.ts tests/unit/skill-router.test.ts && npm run typecheck`

Expected: PASS.

- [x] **Step 5: Commit**

Committed as `feat: add catalog routing policy`.

- [ ] **Step 5: Commit**

```bash
git add catalog src/domain/catalog.ts src/services/skill-router.ts tests/unit/catalog.test.ts tests/unit/skill-router.test.ts
git commit -m "feat: add catalog routing policy"
```

### Task 3: Implement release-tag-only resolution

**Files:**

- Create: `src/domain/version.ts`
- Create: `src/services/release-resolver.ts`
- Test: `tests/unit/release-resolver.test.ts`

**Interfaces:**

```ts
export interface GitHubRelease {
  tagName: string;
  publishedAt: string;
  draft: boolean;
  prerelease: boolean;
}

export interface ResolvedRelease {
  repo: string;
  tag: string;
  commitSha: string;
  resolvedAt: string;
}

export interface ReleaseResolver {
  resolveLatestStable(repo: string): Promise<ResolvedRelease>;
}
```

- [ ] **Step 1: Write the failing tests**

Cover:

1. Select the newest published non-draft, non-prerelease release.
2. Resolve the selected tag to a commit SHA.
3. Reject a repository with no stable release using `NoStableReleaseError`.
4. Reject an empty or malformed tag response.
5. Never call `downloadTagArchive` during resolution.

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- --run tests/unit/release-resolver.test.ts`

Expected: FAIL because the resolver and error types do not exist.

- [ ] **Step 3: Write minimal implementation**

Filter releases, sort by `publishedAt` descending, resolve exactly one tag, and return the immutable SHA record. Do not fall back to `main`, `master`, or any branch.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- --run tests/unit/release-resolver.test.ts && npm run typecheck`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/domain/version.ts src/services/release-resolver.ts tests/unit/release-resolver.test.ts
git commit -m "feat: resolve stable GitHub releases only"
```

### Task 4: Add metadata TTL, jitter, and single-flight locking

**Files:**

- Create: `src/domain/cache.ts`
- Create: `src/services/metadata-cache.ts`
- Test: `tests/unit/metadata-cache.test.ts`
- Test: `tests/unit/source-lock.test.ts`

**Interfaces:**

```ts
export interface MetadataRecord {
  repo: string;
  release: ResolvedRelease;
  checkedAt: string;
  expiresAt: string;
}

export interface MetadataCache {
  getLatest(repo: string, sessionId: string): Promise<MetadataRecord>;
}
```

- [ ] **Step 1: Write the failing tests**

Cover:

1. Fresh metadata is read without a GitHub request.
2. Stale metadata causes exactly one refresh.
3. TTL is 24 hours plus bounded jitter.
4. Two concurrent stale requests cause one GitHub refresh and both receive the same record.
5. A stale lock is reclaimed after its timeout.
6. A GitHub failure returns the last verified metadata when available.
7. A first-ever GitHub failure returns an actionable error.

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- --run tests/unit/metadata-cache.test.ts tests/unit/source-lock.test.ts`

Expected: FAIL because cache and lock behavior are not implemented.

- [ ] **Step 3: Write minimal implementation**

Use per-repository lock keys, re-check freshness after acquiring a lock, and calculate jitter from injected `Clock.random()`. Persist metadata through atomic temporary-file rename.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- --run tests/unit/metadata-cache.test.ts tests/unit/source-lock.test.ts && npm run typecheck`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/domain/cache.ts src/services/metadata-cache.ts tests/unit/metadata-cache.test.ts tests/unit/source-lock.test.ts
git commit -m "feat: prevent metadata cache stampedes"
```

### Task 5: Download, verify, and atomically publish release objects

**Files:**

- Create: `src/services/artifact-cache.ts`
- Test: `tests/unit/artifact-cache.test.ts`

**Interfaces:**

```ts
export interface CachedArtifact {
  repo: string;
  skillPath: string;
  tag: string;
  commitSha: string;
  sha256: string;
  objectPath: string;
}

export interface ArtifactCache {
  ensure(release: ResolvedRelease, skillPath: string): Promise<CachedArtifact>;
}
```

- [ ] **Step 1: Write the failing tests**

Cover:

1. A missing object downloads the exact release tag archive.
2. The SHA-256 digest is recorded in artifact metadata.
3. A temporary download is renamed into the immutable object path only after extraction and skill-path validation.
4. Existing objects are reused without downloading.
5. A missing `SKILL.md` fails and leaves no partial object.
6. Concurrent object requests share one per-source lock.

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- --run tests/unit/artifact-cache.test.ts`

Expected: FAIL because artifact caching is not implemented.

- [ ] **Step 3: Write minimal implementation**

Download the resolved tag archive, calculate SHA-256, extract to a unique temporary directory, validate `<skillPath>/SKILL.md`, write metadata, and atomically rename the completed object directory. Never overwrite an existing immutable object.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- --run tests/unit/artifact-cache.test.ts && npm run typecheck`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/services/artifact-cache.ts tests/unit/artifact-cache.test.ts
git commit -m "feat: cache verified release artifacts atomically"
```

### Task 6: Add disposable session activation and garbage collection

**Files:**

- Create: `src/domain/session.ts`
- Create: `src/services/session-manager.ts`
- Test: `tests/unit/session-manager.test.ts`
- Test: `tests/integration/session-lifecycle.test.ts`

**Interfaces:**

```ts
export interface SessionManager {
  start(sessionId: string): Promise<string>;
  activate(sessionId: string, artifact: CachedArtifact): Promise<string>;
  cleanup(sessionId: string): Promise<void>;
  collectAbandoned(now: Date): Promise<number>;
}
```

- [ ] **Step 1: Write the failing tests**

Cover:

1. Starting a session creates only `sessions/<id>/active`.
2. Activating a skill materializes it under the session directory.
3. Cleanup removes the session activation but preserves the shared artifact.
4. Cleanup is idempotent.
5. Abandoned sessions older than the configured TTL are removed.
6. A session cannot activate an artifact whose metadata SHA does not match its directory.
7. Integration test proves two sessions share one cached release and cleanup one session leaves the other intact.

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- --run tests/unit/session-manager.test.ts tests/integration/session-lifecycle.test.ts`

Expected: FAIL because session management is not implemented.

- [ ] **Step 3: Write minimal implementation**

Create per-session directories with restrictive permissions, copy or link only the selected skill, preserve the shared object directory, and implement startup garbage collection for abandoned sessions.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- --run tests/unit/session-manager.test.ts tests/integration/session-lifecycle.test.ts && npm run typecheck`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/domain/session.ts src/services/session-manager.ts tests/unit/session-manager.test.ts tests/integration/session-lifecycle.test.ts
git commit -m "feat: add disposable skill sessions"
```

### Task 7: Build CLI commands and composition root

**Files:**

- Create: `src/cli/main.ts`
- Create: `bin/skill-router.mjs`
- Create: `tests/integration/cli.test.ts`

**Interfaces:**

```text
skill-router list
skill-router explain "task text"
skill-router use <skill-id> --session <id>
skill-router check-updates --session <id>
skill-router install <skill-id> --confirm --session <id>
skill-router update <skill-id> --confirm --session <id>
skill-router clean [--session <id>]
```

- [ ] **Step 1: Write the failing tests**

Cover:

1. `list` prints IDs/categories without loading full skill bodies.
2. `explain` prints the selected skill and rejected conflicts.
3. `use` creates a session activation and prints its path.
4. `check-updates` checks release metadata but does not download artifacts.
5. `install` without `--confirm` prints the source/tag/SHA and exits nonzero without writing.
6. `install --confirm` downloads and activates the stable tag.
7. `clean` removes only session data.

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- --run tests/integration/cli.test.ts`

Expected: FAIL because the CLI is not implemented.

- [ ] **Step 3: Write minimal implementation**

Wire concrete adapters only in `src/cli/main.ts`. Keep services dependent on protocols. Use explicit confirmation for downloads and updates.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- --run tests/integration/cli.test.ts && npm run build`

Expected: PASS and `dist/` contains the runnable CLI.

- [ ] **Step 5: Commit**

```bash
git add src/cli bin tests/integration/cli.test.ts
git commit -m "feat: add skill router CLI"
```

### Task 8: Add the global router skill, catalog, and bootstrap command

**Files:**

- Create: `skill/SKILL.md`
- Create: `scripts/bootstrap-global.mjs`
- Modify: `catalog/catalog.yaml`
- Test: `tests/integration/bootstrap-global.test.ts`

- [ ] **Step 1: Write the failing tests**

Cover:

1. Bootstrap places only `skill-router/SKILL.md` under `~/.agents/skills/`.
2. Bootstrap places the catalog and CLI under `~/.codex/skill-router/`.
3. Bootstrap places optional source trees under `~/.codex/skill-library/`, never under active discovery.
4. Re-running bootstrap is idempotent.
5. `SKILL.md` instructs the agent to route before loading optional skills and to use release tags only.

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- --run tests/integration/bootstrap-global.test.ts`

Expected: FAIL because bootstrap and the global skill do not exist.

- [ ] **Step 3: Write minimal implementation**

Create a short router skill that points to the catalog and CLI. Make bootstrap copy built files and catalog entries into the global paths without copying dormant skills into the active directory.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- --run tests/integration/bootstrap-global.test.ts && npm run build`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add skill scripts catalog tests/integration/bootstrap-global.test.ts
git commit -m "feat: add global router bootstrap"
```

### Task 9: Document operations and run the complete verification suite

**Files:**

- Create: `docs/INSTALL.md`
- Create: `docs/USAGE.md`
- Modify: `tasks/todo.md`
- Test: `tests/integration/end-to-end.test.ts`

- [ ] **Step 1: Write the failing end-to-end test**

Exercise this sequence in a temporary home directory:

```text
bootstrap → list → check-updates → install stable release
→ request same skill concurrently from two sessions
→ verify one download and one shared object
→ activate both sessions
→ clean session A
→ verify session B and shared object remain
→ clean session B
→ collect abandoned sessions
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- --run tests/integration/end-to-end.test.ts`

Expected: FAIL until all previous tasks are integrated.

- [ ] **Step 3: Complete documentation and minimal integration fixes**

Document global paths, release-only policy, cache layout, lock behavior, session cleanup, offline fallback, supported commands, and the fact that no stable release tag means no install.

- [ ] **Step 4: Run the full verification suite**

Run:

```bash
npm test -- --run
npm run typecheck
npm run build
git diff --check
```

Expected: zero test failures, zero skipped tests, zero type errors, successful build, and clean diff formatting.

- [ ] **Step 5: Commit**

```bash
git add docs tasks/todo.md tests/integration/end-to-end.test.ts
git commit -m "docs: document skill router operations"
```

### Task 10: Add release-managed RTK runtime tooling

**Files:**

- Create: `src/ports/tooling.ts`
- Create: `src/services/tool-release-manager.ts`
- Create: `tests/unit/tool-release-manager.test.ts`
- Create: `docs/RTK.md`
- Modify: `src/ports/github.ts`, `src/index.ts`, `src/cli/main.ts`

- [ ] **Step 1: Write the failing tests**

Cover stable Release-tag selection, rejection of drafts/prereleases/branches/
untagged artifacts, host asset selection, explicit-confirmation gating,
checksum and binary-version verification, atomic replacement, preservation of
the previous binary on failure, rollback, and the invariant that RTK never uses
the per-session skill cache or silently edits `AGENTS.md`.

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- --run tests/unit/tool-release-manager.test.ts`

- [ ] **Step 3: Implement the minimum release manager**

Use the same allowlisted GitHub release resolver and lock protocol as skills.
Download the exact stable RTK asset to a temporary path, verify checksum and
reported version, then atomically replace the global binary while retaining a
rollback path.

- [ ] **Step 4: Refactor and document**

Keep RTK outside skill activation/session cleanup. Document the explicit
confirmation boundary and the fact that Codex integration changes require a
reviewable diff.

- [ ] **Step 5: Commit**

```bash
git add src tests docs/RTK.md
git commit -m "feat: add release-managed RTK tooling"
```

## 3. Dependency Notes

```text
Task 1
  ├── Task 2: catalog and route policy
  ├── Task 3: release resolution
  │     └── Task 4: metadata cache and locks
  │           └── Task 5: artifact cache
  │                 └── Task 6: session activation
  │                       └── Task 7: CLI
  │                             └── Task 8: global bootstrap
  │                                   └── Task 9: end-to-end verification
  └── Task 10: RTK runtime tooling (after Tasks 3–5)
```

Task 2 and Task 3 can be developed independently after Task 1, but all later tasks depend on their protocols and behavior. Task 4 must be complete before artifact download work so the shared cache cannot gain an unprotected refresh path.

## 4. Integration Points

- Existing `~/.codex/AGENTS.md` remains unchanged and has higher priority than router-selected skills.
- Existing Superpowers remains active; the router does not replace it or install a second workflow pack.
- `~/.agents/skills/skill-router/SKILL.md` is the only new always-discovered global skill.
- `~/.codex/skill-library/` is intentionally outside active discovery.
- The router must not modify project `AGENTS.md`, source files, or user data files.
- GitHub access is limited to release metadata, tag resolution, and explicitly confirmed tag archive downloads.
- RTK is installed globally from a verified stable Release asset and is independent of session skill activation.

## 5. Definition of Done

- [ ] All tasks completed and statuses updated to done.
- [ ] Stable Release tags are the only installable versions.
- [ ] No-release repositories fail closed.
- [ ] Metadata refreshes use TTL, jitter, and per-source single-flight locks.
- [ ] Artifact publication is atomic and immutable.
- [ ] Concurrent sessions share one verified artifact.
- [ ] Session activation is removed without deleting shared cache objects.
- [ ] Dormant skills remain outside active discovery.
- [ ] RTK uses only verified stable Release assets with platform selection, checksum/version checks, atomic replacement, and rollback.
- [ ] RTK installation never silently modifies `AGENTS.md` or global hooks/config.
- [ ] `npm test -- --run` passes with zero failures and zero skipped tests.
- [ ] `npm run typecheck` passes.
- [ ] `npm run build` passes.
- [ ] Existing workspace PDF/JSON files remain unstaged.
- [ ] Changes use logical conventional commits.
- [ ] Branch is pushed to its configured remote before handoff.
