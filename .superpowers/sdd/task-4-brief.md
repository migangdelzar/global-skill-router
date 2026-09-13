# Task 4: Add metadata TTL, jitter, and single-flight locking

## Objective

Implement persistent release metadata caching with bounded TTL jitter and per-repository single-flight locking.

## Scope

- Create `src/domain/cache.ts`.
- Create `src/services/metadata-cache.ts`.
- Create `tests/unit/metadata-cache.test.ts` and `tests/unit/source-lock.test.ts`.

## Required contract

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

## Acceptance tests

1. Fresh metadata is read without a GitHub request.
2. Stale metadata causes exactly one refresh.
3. TTL is 24 hours plus bounded jitter.
4. Two concurrent stale requests cause one GitHub refresh and both receive the same record.
5. A stale lock is reclaimed after its timeout.
6. A GitHub failure returns last verified metadata when available.
7. First-ever GitHub failure returns an actionable error.

## TDD and verification

Write tests first and prove focused failure before implementation. Re-check freshness after lock acquisition. Use per-repository lock keys, injected clock randomness, and atomic temporary-file rename for metadata persistence. Run:

```bash
npm test -- --run tests/unit/metadata-cache.test.ts tests/unit/source-lock.test.ts
npm run typecheck
```

Commit with:

```text
feat: prevent metadata cache stampedes
```

Write `.superpowers/sdd/task-4-report.md`. Do not modify existing PDF/JSON or RTK/global files.
