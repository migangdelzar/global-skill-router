# Global Skill Router Design

**Date:** 2026-09-13  
**Status:** Implemented
**Scope:** Codex global skill discovery, versioning, caching, and session activation

## Goal

Provide one small global router that selects the user's preferred skill for a task, loads only the selected skill when needed, installs only verified GitHub release tags, and removes session activation state when the session ends.

## Problem

The user has several overlapping skill families:

- workflow and engineering: Superpowers, Addy Osmani, Matt Pocock, Everything Claude Code, Karpathy, Ponytail, Caveman;
- UI quality: Emil Kowalski, Apple Design, Impeccable, UI UX Pro Max, Taste;
- codebase comprehension: Graphify and Understand-Anything;
- document creation: Anthropic document skills.

Loading every full skill globally risks conflicting instructions, unnecessary context, duplicate workflows, and repeated downloads. The system needs a durable catalog but disposable per-session activation.

## Design Summary

Use a hub-and-spoke design:

```text
Global AGENTS.md + Superpowers
              |
              v
       skill-router/SKILL.md
              |
              v
        compact catalog
              |
     +--------+--------+
     |                 |
 selected skill   update metadata
     |                 |
     v                 v
 session cache   release-tag cache
```

Only the router and existing core rules are active by default. Optional skills live outside the active discovery directory. The router reads their metadata, chooses a skill, and loads its `SKILL.md` plus required references into a session-scoped activation directory.

## Activation Policy

1. An explicit user-selected skill wins.
2. Project `AGENTS.md` rules remain authoritative.
3. Select one primary workflow or specialist skill.
4. Add at most one compatible adjunct and one reviewer.
5. Never activate two competing workflow packs in the same task.
6. Do not silently download or update a skill.
7. Do not activate a skill whose source has no stable GitHub Release tag.
8. Do not replace a skill during the current session after activation.
9. Load referenced documentation and scripts only when the selected workflow reaches that step.
10. If the selected skill is unavailable, report the reason and offer the approved install action.

### Tooling Routing Policy

Repository search and CLI-output reduction are separate concerns. The router
always selects `tgrep` for repository search because the project instruction
requires its indexed search behavior. RTK is an optional automatic tooling
adjunct for CLI-heavy tasks such as running tests, inspecting Git state, or
reading build logs. The router must not replace `tgrep` with `grep`, `rg`, or
`rtk grep`, and RTK command rewriting must exclude `tgrep` so search results
remain exact.

RTK is skipped when the task requests exact raw command output or investigates
command-output formatting. Routing may recommend an already-installed RTK
integration, but install/update and hook/config changes remain explicit
confirmed operations.

## Global File Layout

```text
~/.codex/
├── AGENTS.md
├── skill-router/
│   ├── catalog.yaml
│   ├── state.json
│   ├── cache/
│   │   ├── metadata/
│   │   └── objects/
│   ├── locks/
│   └── sessions/<session-id>/
│       └── active/<skill-id>/
└── skill-library/                    # dormant source trees only

~/.local/bin/rtk                       # globally installed RTK release binary
~/Library/Application Support/rtk/    # RTK config/state on macOS

~/.agents/skills/
├── skill-router/SKILL.md              # small active router
└── superpowers/                       # existing active skill set
```

The dormant library must not be under `~/.agents/skills/`; otherwise Codex may discover and auto-trigger every optional skill.

## Catalog Model

`catalog.yaml` contains only routing metadata and approved sources. It must not embed full skill instructions.

```yaml
skills:
  - id: emil-design-eng
    category: ui
    source: emilkowalski/skills
    skill_path: skills/emil-design-eng
    use_when: [ui polish, animation, interaction, component craft]
    activation: automatic
    conflicts_with: [ui-ux-pro-max]
    release_policy: latest-stable-tag

  - id: taste
    category: ui-research
    source: senlindesign/taste-skill
    skill_path: .
    use_when: [analyze website design, extract design DNA, study visual reference]
    requires: [playwright]
    activation: explicit
    release_policy: latest-stable-tag
```

Each entry records:

- stable skill ID and source repository;
- path within the repository;
- category, trigger phrases, prerequisites, and conflicts;
- activation mode;
- release-only version policy;
- last checked release, resolved tag, commit SHA, checksum, and timestamps in `state.json`.

## Recommended Skill Roles

### Core

- Existing global `AGENTS.md`: engineering rules and user-specific behavior.
- Superpowers: brainstorming, planning, implementation, and verification.
- Skill router: cross-library selection and cache orchestration.

### Optional Specialists

- Emil `emil-design-eng`: default UI craft and motion specialist.
- Apple Design: Apple HIG and platform-specific review.
- Taste: reference-site analysis; explicit invocation only.
- Impeccable: structured UI audit; explicit invocation only.
- UI UX Pro Max: broad design-system/style generation; explicit invocation only.
- Understand-Anything or Graphify: choose one codebase graph tool.
- Anthropic document skills: install only the required document format skills.

### Not Installed as Additional Global Rules

- Full Addy pack, full Matt pack, or ECC: competing workflow ecosystems.
- Karpathy and Ponytail: already covered by the user's global engineering rules.
- Duplicate Caveman: already covered by the user's global response preference.

### Tooling Adjuncts

- `tgrep`: required repository-search command; not a downloadable skill.
- `rtk-cli-filter`: automatic CLI-output optimization adjunct; compatible with
  Caveman and `tgrep`, with `tgrep` excluded from RTK rewriting.

## Version Resolution

The only acceptable install source is the newest stable GitHub Release tag.

```text
resolve(repo)
  -> query GitHub releases/tags metadata
  -> exclude prereleases and drafts
  -> choose newest stable release tag
  -> resolve tag to immutable commit SHA
  -> download exact tagged tree
  -> verify archive/tree checksum
  -> atomically publish cache object
```

Rules:

- Never use `main`, `master`, another branch, or an untagged commit.
- If the repository has no stable Release tag, fail closed and report it.
- If GitHub is unavailable, use the last verified release cache.
- A newer release is recorded as an available update; it does not mutate an active session.
- Prereleases require an explicit user request and a separate policy override.

## Runtime Tooling: tgrep and RTK

`tgrep` is a required global repository-search dependency. `doctor` checks for
it explicitly, and the release manager can install/update it from the newest
stable `microsoft/tgrep` asset for the host target. If it is missing, the
router reports the prerequisite instead of silently changing search semantics
to `rg` or `grep`. The global bootstrap installs a launcher at
`~/.local/bin/skill-router`; the active Codex discovery directory receives
only the router `SKILL.md`.

RTK is a global runtime-tooling layer, not a session skill. It compresses
supported shell output before it reaches the agent. The router can return an
`rtk-cli-filter` tooling decision for matching tasks, but that decision never
copies RTK into a session skill directory or installs it.

- Manage RTK from the newest stable Release tag in `rtk-ai/rtk` only.
- Select the release asset for the host OS and architecture; reject branches,
  untagged archives, drafts, and prereleases.
- Verify the asset checksum and the installed binary's reported version before
  atomic replacement. Preserve the previous binary for rollback.
- Install or update only after explicit confirmation, and never silently modify
  `~/.codex/AGENTS.md` or global hooks/config. Show the proposed diff first.
- Keep RTK's global config/state outside the per-session skill cache. Session
  cleanup must never remove the RTK binary or its global config.
- Treat compressed output as a lossy presentation layer: support passthrough or
  command exclusions when full output is needed, and do not claim it reduces
  actual model billing.

## Metadata Freshness

GitHub metadata is checked at most once per source during a session. A persistent metadata TTL of 24 hours avoids repeated API calls across sessions. Add bounded random jitter to the TTL so multiple machines or sessions do not refresh at the same instant.

```text
if metadata is fresh:
    use metadata cache
else:
    acquire source metadata lock
    re-check freshness after lock acquisition
    fetch latest stable release only if still stale
    atomically write metadata
```

## Cache-Stampede Protection

The router uses single-flight behavior at both process and filesystem levels.

- One lock per repository/skill source, not one global lock.
- The first requester refreshes; concurrent requesters wait briefly and reuse the result.
- Lock acquisition uses an exclusive create operation.
- Lock records include owner, PID, session ID, and creation time.
- Stale locks expire after a bounded timeout and are safely reclaimed.
- Downloads write to a unique temporary directory, verify contents, then rename atomically.
- A stale-but-verified release may be served while one process refreshes metadata.
- Failed fetches receive a short negative-cache TTL to prevent retry storms.
- Session activation points to shared immutable cache objects rather than duplicating downloads.

```text
session A ─┐
session B ─┼─> source lock ─> one release fetch ─> immutable cache object
session C ─┘                                      └> all sessions reuse it
```

## Session Lifecycle

At session start:

1. Obtain or generate a session ID.
2. Create `sessions/<session-id>/active/` with restrictive permissions.
3. Read catalog metadata only.
4. Refresh stale release metadata once per source, subject to locks.

When a skill is selected:

1. Resolve the exact cached release object.
2. Materialize a session activation link or copy.
3. Load only that skill's `SKILL.md`.
4. Load references/scripts only when required.

At session end:

- remove only the session activation directory;
- retain verified immutable release objects for reuse;
- retain metadata until TTL expiry;
- run startup garbage collection for abandoned sessions and expired objects.

If the host provides no reliable end-session hook, cleanup is best-effort at shutdown plus mandatory TTL-based cleanup on the next router invocation. The router must never delete the shared verified cache as part of normal session cleanup.

## Install and Update Commands

The router should expose these operations:

```text
/skill-router list
/skill-router explain <task>
/skill-router use <skill-id>
/skill-router check-updates
/skill-router install <skill-id>
/skill-router update <skill-id>
/skill-router clean
```

`install` and `update` must show repository, release tag, commit SHA, prerequisites, and requested filesystem/network actions before proceeding. The router never installs from a branch fallback.

## Failure Handling

| Scenario | Behavior |
|---|---|
| No matching skill | Explain that no approved skill matches; continue with core rules if safe. |
| Multiple matching specialists | Apply catalog priority and report the chosen skill plus alternatives. |
| Conflicting workflow skills | Choose the explicit one; otherwise stop and ask. |
| No stable release tag | Do not install; report source and reason. |
| GitHub rate limit/network failure | Use last verified cache; otherwise fail with retry guidance. |
| Lock held | Wait with bounded timeout, then use verified cache or report contention. |
| Corrupt download/checksum mismatch | Delete only the temporary object and fail closed. |
| Abandoned session cache | Remove only after TTL expiry; never remove shared objects. |
| Missing prerequisite | Report exact prerequisite and do not activate the skill. |
| RTK asset unavailable for this host | Do not install; preserve the current binary and report the supported assets. |
| RTK checksum/version verification fails | Reject the temporary download, preserve the current binary, and report the mismatch. |

## Security and Trust

- Catalog sources are allowlisted and reviewed by the user.
- Release tags, resolved SHAs, and checksums are recorded.
- No arbitrary branch or untagged code is accepted.
- Skill scripts are not executed merely because a skill is installed.
- Network access is used only for metadata or an explicitly approved install/update.
- Project files are not uploaded by the router itself.
- Shared cache objects are immutable and replaced only by a new verified release.

## Verification Strategy

The implementation must verify:

- catalog parsing and conflict selection;
- release-only version resolution;
- prerelease and no-release rejection;
- tag-to-SHA recording;
- metadata TTL and jitter behavior;
- single-flight locking under concurrent requests;
- atomic publish after checksum verification;
- stale-cache fallback;
- per-session activation and cleanup;
- abandoned-session garbage collection;
- no writes to the active discovery directory for dormant skills;
- no regression to the existing global AGENTS.md and Superpowers setup.

## Out of Scope

- Replacing Codex's native skill discovery implementation.
- Automatically trusting arbitrary third-party skills.
- Installing all skills from any one pack.
- Applying Apple design rules to every UI task by default.
- Running Graphify or Understand-Anything automatically on every repository.
- Treating RTK as a session skill or deleting its global binary/config during session cleanup.

## Decision

Implement the approved catalog-plus-cache router plus a separately managed RTK runtime layer. Use the newest stable GitHub Release tag only for both, protect shared metadata/content refreshes with per-source single-flight locks, and delete only per-session activation state at session cleanup.
