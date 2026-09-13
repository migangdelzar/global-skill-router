# Global Skill Router

- [x] Restate goal and acceptance criteria
- [x] Explore existing global Codex instructions and current workspace
- [x] Design minimal architecture and version/cache policy
- [ ] Write and review implementation plan
- [ ] Implement catalog and router behavior
- [ ] Add tests for release-only resolution and cache stampede protection
- [ ] Add tests for session activation and cleanup
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
