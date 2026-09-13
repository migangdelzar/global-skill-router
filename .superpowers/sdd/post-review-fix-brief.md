# Post-review integration fixes

Address every High and Medium finding from the final review with strict TDD.

1. Make CLI `use <skill> --session <id>` actually activate the selected skill through the session manager; return errors when activation is unavailable/fails. Keep confirmation for network/install operations.
2. Harden session activation: validate requested repo, skillPath, tag, and 40-hex commit SHA against artifact metadata; reject absolute paths, `..`, backslashes, and traversal before resolving/copying. Copy only the selected skill directory.
3. Add a filesystem-backed per-tool lock to RTK/tgrep installs/updates, with unique temp paths and safe backup handling. Concurrent installs must serialize.
4. Make tool replacement rollback atomic for binary and persisted metadata: a failed post-replacement operation must restore the prior pair or leave the prior pair active, never mix versions.
5. For GitHub tag resolution, require the ref response to identify `refs/tags/<tag>` exactly; branch/default-branch responses must fail closed. Apply to skill and tool adapters.
6. Replace tool version substring matching with exact normalized version equality.
7. Persist per-session metadata-check state (success and negative cache) so separate CLI processes with the same session ID honor once-per-session behavior. Preserve stale verified fallback.

Add regression/integration tests first. Preserve tgrep as search command, RTK exclusions, release-tag-only policy, and user PDF/JSON files. Run focused/full Bun tests, typecheck, build, diff check, and remote-ref verification. Commit logical conventional commits and write `.superpowers/sdd/post-review-fix-report.md`.
