# Post-review Fix Report

## Scope

Implemented every High and Medium finding in `post-review-fix-brief.md` with regression coverage. Protected PDF/JSON files were not staged or modified.

## Fixes

- `use <skill> --session <id>` now activates the cached selected skill through the session manager and returns actionable errors. Network/install work remains confirmation-gated.
- Session activation validates repo, skill path, tag, SHA, object path, and digest metadata; rejects absolute paths, traversal, and Windows separators; copies only the selected skill directory.
- RTK/tgrep installs use the injected filesystem-backed per-tool lock, unique temporary/backup paths, exact normalized version checks, checksum verification, and paired binary/metadata rollback.
- GitHub adapters resolve through `/git/ref/tags/<tag>` and accept only an exact `refs/tags/<tag>` response. Branch/default-branch responses fail closed.
- Metadata success and negative-cache state are persisted under the disposable session directory, so separate CLI processes sharing a session ID honor once-per-session behavior. Session cleanup removes that state while preserving shared artifacts.

## Verification

- Focused regression suite: 50/50 tests passed.
- Full Bun suite: 99/99 tests passed; 14/14 test files passed.
- `bun run typecheck`: passed.
- `bun run build`: passed.
- `git diff --check`: passed.
- Remote-ref verified after push: `185d428 docs: add post-review fix report`.

## Commits

- `6d3491a fix(router): activate cached skills and persist session checks`
- `35fda79 fix(tooling): serialize installs and rollback verified pairs`
- `05faeba fix(github): require exact release tag refs`
