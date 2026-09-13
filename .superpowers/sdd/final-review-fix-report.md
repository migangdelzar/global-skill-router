# Final review fix report: root skill paths and previews

## Scope

Implemented `.superpowers/sdd/final-review-fix-brief.md` with strict TDD.

### Root skill paths

- `skill_path: .` is now accepted by artifact validation.
- Root skills validate the repository-root `SKILL.md`.
- Session activation copies only that `SKILL.md` via `copyFile`; it never copies the cached repository tree.
- Traversal, absolute paths, Windows separators, canonical cache paths, and metadata integrity checks remain enforced.
- Added catalog coverage for `taste`, `impeccable`, `ui-ux-pro-max`, `graphify`, and `understand-anything`.

### Complete previews

- Unconfirmed `install`/`update` resolves the newest stable release and immutable commit SHA without writing metadata or downloading an archive.
- Unconfirmed `install-tool`/`update-tool` resolves the newest stable tool release and host asset without downloading or installing it.
- Both previews print release tag, immutable SHA, checksum/asset status, prerequisites, exact planned network/filesystem actions, and the `--confirm` write boundary.
- Skill archive checksum is explicitly reported as computed and recorded only after the confirmed download; tool asset checksums remain required before confirmation.

## TDD evidence

1. Red: root artifact/session tests and preview assertions failed for the expected missing behavior.
2. Green: focused suite passed with 48/48 tests.
3. Regression coverage added for the real `NodeFileSystem.copyFile` path and disk preview no-write behavior.
4. Full suite passed with 111/111 tests.

## Verification

- `bun run test -- --run`: 111/111 passed
- `bun run typecheck`: passed
- `bun run build`: passed
- `git diff --check`: passed
- PDF/JSON inputs were not modified

Code/tests commit: `f164511 fix(router): support root skills and complete previews`

