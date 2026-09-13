---
name: skill-router
description: Route tasks to one approved optional skill and the required CLI tooling policy.
---

# Skill Router

Read the compact catalog under `~/.codex/skill-router/catalog/catalog.yaml`.
Choose one primary workflow or specialist skill, at most one compatible adjunct,
and one reviewer. Project `AGENTS.md` rules and explicit user choices win.

For repository searches, use `tgrep`. RTK may reduce noisy Git/test/log output,
but must not rewrite or replace `tgrep`. If a required tool is unavailable,
report it and request explicit installation; never silently download a skill or
tool.

Use the router CLI for catalog and route inspection:

```text
skill-router list
skill-router explain "task text"
```
