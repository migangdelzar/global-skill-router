# RTK

RTK is global runtime tooling, not a session skill. The router may select it for
noisy Git, test, build, and log commands. It must not rewrite `tgrep`.

Installation/update uses a stable GitHub Release asset, explicit confirmation,
platform selection, checksum/version verification, atomic replacement, and a
previous-binary rollback path. Session cleanup never removes RTK or its global
config. Use passthrough/raw commands when exact output is required.

```bash
skill-router doctor
skill-router install-tool rtk --confirm
skill-router update-tool rtk --confirm
```

The manager rejects drafts, prereleases, unsupported host targets, checksum
mismatches, and binaries whose reported version does not match the release
tag. A failed replacement attempts to restore the previous binary.
