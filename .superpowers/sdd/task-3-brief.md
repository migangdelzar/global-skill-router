# Task 3: Implement release-tag-only resolution

## Objective

Implement stable GitHub Release resolution with immutable tag-to-commit records.

## Scope

- Create `src/domain/version.ts`.
- Create `src/services/release-resolver.ts`.
- Create `tests/unit/release-resolver.test.ts`.

## Required contracts

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

## Acceptance tests

1. Select the newest published non-draft, non-prerelease release.
2. Resolve the selected tag to a commit SHA.
3. Reject a repository with no stable release using `NoStableReleaseError`.
4. Reject an empty or malformed tag response.
5. Never call `downloadTagArchive` during resolution.

## TDD and verification

Write tests first and prove failure before implementation. Then run:

```bash
npm test -- --run tests/unit/release-resolver.test.ts
npm run typecheck
```

Filter releases, sort by `publishedAt` descending, resolve exactly one tag, and never fall back to `main`, `master`, branches, or untagged commits. Commit with:

```text
feat: resolve stable GitHub releases only
```

Write `.superpowers/sdd/task-3-report.md`. Do not modify existing PDF/JSON or RTK/global files.
