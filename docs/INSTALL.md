# Installation

This router uses Bun `1.4.x` and Vitest:

```bash
bun install --frozen-lockfile
bun run bootstrap
```

Only `skill-router/SKILL.md` enters `~/.agents/skills/`. Catalog, CLI, and
dormant sources stay under `~/.codex/skill-router/` or
`~/.codex/skill-library/`.

The bootstrap also installs `~/.local/bin/skill-router`. Keep `~/.local/bin`
on `PATH`, then run `skill-router doctor` to check global tooling.

Missing `tgrep` and RTK are reported and require explicit confirmation before
stable-release installation. The router never installs a branch, prerelease,
draft, or untagged commit.
