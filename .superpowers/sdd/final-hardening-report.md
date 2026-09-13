# Final Integration Hardening Report

## Scope

Implemented every High and Medium finding from the broad review. The PDF and JSON files were not modified.

## Changes

1. **Global composition and lifecycle**
   - `runCliFromDisk` now constructs the release resolver, metadata cache, artifact cache, session manager, filesystem lock, and cleanup wiring.
   - Confirmed `install`/`update` resolves release metadata, downloads and verifies the selected skill artifact, and activates it in the requested session.
   - `clean` now requires `--confirm` and performs session cleanup; unconfirmed cleanup is a no-op.
   - Added a disk-composition integration test covering install, activation, dormant-skill isolation, and clean.

2. **Session isolation and permissions**
   - Activation copies only `<cached-object>/<skillPath>`.
   - Session directories are created with mode `0700` through the filesystem protocol.
   - Metadata/artifact temporary cache directories use mode `0700`.

3. **RTK/tgrep release integrity**
   - Tool releases resolve their selected stable tag through GitHub to a validated 40-hex commit SHA.
   - Missing, malformed, or mismatched checksums are rejected before installation.
   - Older requested versions cannot override newest-stable selection.
   - Install metadata persists repo, tag, commit SHA, asset, and checksum.
   - Existing binary and metadata rollback remains preserved on replacement failure.

4. **Artifact cache integrity**
   - Existing metadata must match requested repo, skill path, tag, commit SHA, and derived object path.
   - Unsafe/non-40-hex commit SHAs are rejected before cache access.

5. **Metadata session state**
   - Successful checks are remembered per repo/session and reused after TTL expiry within that session.
   - Existing negative-cache and post-lock-wait behavior remains covered.

6. **Catalog security**
   - Sources must use the approved GitHub `owner/repository` form.
   - Absolute, traversal, empty-segment, backslash, and unsafe skill paths are rejected.

## Verification

```text
bun run test -- --run   13 files, 80 tests passed
bun run typecheck       passed
bun run build           passed
git diff --check        passed
```

## Commits

- `2d558a5` fix(session): isolate skill activation and private dirs
- `76c7f70` fix(cache): validate artifact identity before reuse
- `83c3867` fix(cache): scope metadata checks to sessions
- `2eb5696` fix(catalog): enforce safe GitHub sources and paths
- `cf6cd87` fix(tooling): require immutable verified releases
- `e1c6171` fix(cli): wire disk lifecycle composition
- `454aef8` fix(cli): confirm destructive session cleanup
- `f189fc6` test(fixtures): preserve legacy filesystem call records

## Remote

The branch has configured remote `origin` at `git@github.com:migangdelzar/global-skill-router.git`; the final push and remote-ref verification are performed after this report commit.
