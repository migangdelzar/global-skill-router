# tgrep

`tgrep` is managed as global tooling, not as a session skill.

- Source: `microsoft/tgrep`
- Preferred command: `tgrep`
- Index state: `.tgrep/` (ignored by Git)
- Preferred install target: `~/.local/bin/tgrep`

The router checks for `tgrep` at startup. If missing, it offers an explicit
stable-release installation for the host platform and architecture. It never
creates an `rg`/`grep` symlink. If installation is declined and the project has
a hard `tgrep` requirement, routing reports the missing prerequisite.

Use `tgrep serve .` when a background server can stay alive, or `tgrep index .`
when a persistent server is unavailable. Use `tgrep --no-index` for files that
may not yet be represented in the index.

Upstream publishes macOS, Linux, and Windows release assets:
[tgrep installation](https://github.com/microsoft/tgrep).
