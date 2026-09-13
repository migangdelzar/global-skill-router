# Global Skill Router

Small TypeScript/Bun CLI for selecting optional Codex skills without loading
every skill globally.

```bash
bun install --frozen-lockfile
bun run bootstrap
skill-router doctor
skill-router explain "run tests and inspect git"
```

Key rules:

- `tgrep` is the repository-search command. It is never replaced by an `rg` or
  `grep` symlink.
- RTK is optional output optimization and never rewrites `tgrep`.
- Skills and tools install only from stable GitHub Release tags after explicit
  confirmation.
- Shared verified artifacts persist; per-session activation is disposable.
- The bootstrap puts only `skill-router/SKILL.md` in active skill discovery.

See [installation](docs/INSTALL.md), [usage](docs/USAGE.md),
[tgrep](docs/TGREP.md), and [RTK](docs/RTK.md).

The project uses Bun `1.4.2` for package management and scripts. Runtime code
is TypeScript/ESM and targets Node.js 20-compatible APIs.
