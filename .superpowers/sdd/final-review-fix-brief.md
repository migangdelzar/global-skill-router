# Final review fixes: root skill paths and previews

Address the final approval findings with strict TDD.

1. Support catalog entries with `skill_path: .` safely. Artifact/session logic must treat root skills as the selected root `SKILL.md` (or another explicit single-skill payload), never copy the entire repository into active discovery. Preserve safe traversal checks and dormant-skill isolation. Add tests for `taste`, `impeccable`, `ui-ux-pro-max`, `graphify`, and `understand-anything` root paths.
2. Unconfirmed `install` and `install-tool` must produce a complete preview: selected newest stable release tag, immutable commit SHA, checksum/asset, prerequisites, and exact filesystem/network actions. Preview must not download, write, activate, or mutate. Keep `--confirm` as the write boundary.

Run focused tests, full `bun run test -- --run`, typecheck, build, diff check, and remote parity. Commit logical conventional fixes and write `.superpowers/sdd/final-review-fix-report.md`. Do not modify PDF/JSON.
