# Global Skill Router

- [x] Restate goal and acceptance criteria
- [x] Explore existing global Codex instructions and current workspace
- [x] Design minimal architecture and version/cache policy
- [x] Write and review implementation plan
- [x] Implement catalog and router behavior, including tgrep/RTK tooling policy
- [x] Add tests for release-only resolution and cache stampede protection
- [x] Add tests for session activation and cleanup
- [x] Add verified artifact caching with atomic publication
- [ ] Add RTK release-managed global tooling with rollback safeguards
- [ ] Run verification: tests, typecheck/lint, and deterministic cache scenarios
- [ ] Document install/update commands and operational limits

## Working Notes

- Workspace was not a Git repo; initialized on `feat-global-skill-router`.
- Existing user files in the workspace are unrelated and must remain unstaged.
- Active global behavior currently comes from `~/.codex/AGENTS.md` and Superpowers.
- Optional skills must remain outside the active `~/.agents/skills/` discovery path.
- Release policy is latest stable GitHub Release tag only; no branch fallback.
- Shared verified cache persists; per-session activation state is disposable.
- Per-source locks, TTL jitter, stale-cache serving, and atomic publication prevent cache stampedes.
- RTK is separate global tooling: release-tag only, checksum/version verified, atomic replacement, rollback-capable, never session-cached.
- `tgrep` remains the repository-search command; RTK must exclude it from command rewriting.
- RTK is an optional CLI-output adjunct for noisy shell tasks, disabled for exact raw-output requests.
- Task 1 bootstrap is implemented and review-approved; Task 2 catalog/router behavior is complete.
- Task 3 stable-release resolver is implemented and review-approved; Task 4 is implemented and verified.
