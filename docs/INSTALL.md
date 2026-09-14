# Installation

This router uses Bun `1.4.x` and Vitest:

```bash
bun install --frozen-lockfile
bun run bootstrap
```

The bootstrap installs the same canonical `skill-router/SKILL.md` into
`~/.agents/skills/` for Codex and Agent Skills-compatible harnesses, and
`~/.claude/skills/` for Claude Code. OpenCode discovers the shared
`~/.agents/skills/` compatibility path, so no duplicate OpenCode copy is
created. Catalog, CLI, and dormant sources stay under `~/.codex/skill-router/`
or `~/.codex/skill-library/`.

The bootstrap also installs `~/.local/bin/skill-router`. Keep `~/.local/bin`
on `PATH`, then run `skill-router doctor` to check global tooling.

Missing `tgrep` and RTK are reported and require explicit confirmation before
stable-release installation. The router never installs a branch, prerelease,
draft, or untagged commit.

AIUP core is preinstalled in catalog intent only: its six entries remain dormant
and release-gated until `AI-Unified-Process/marketplace` publishes a stable
GitHub Release. Bootstrap does not download AIUP source or install Context7
MCP.
