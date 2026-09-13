# Usage

```bash
skill-router list
skill-router doctor
skill-router explain "Run tests and inspect the git diff"
skill-router use <skill-id> --session <session-id>
skill-router install <skill-id> --confirm --session <session-id>
skill-router update <skill-id> --confirm --session <session-id>
skill-router install-tool tgrep --confirm
skill-router update-tool rtk --confirm
skill-router clean --session <session-id>
```

Repository searches use `tgrep`. RTK may reduce noisy Git/test/build/log
output, but it excludes `tgrep` from rewriting. Exact raw-output requests
disable RTK. Project `AGENTS.md` and explicit user choices win.

`doctor` reports missing `tgrep`/RTK. Tool installation is release-managed and
confirmation-gated; it selects the newest stable GitHub Release asset for the
host platform and architecture, verifies it, then preserves the previous
binary as `.previous` during replacement.
