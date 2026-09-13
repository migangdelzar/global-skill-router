# Task 2 review fixes

Address every High/Medium finding from the Task 2 review, with regression tests first.

## Required fixes

1. Replace substring matching for generic categories/triggers with safe word/phrase matching; `ui` must not match inside `build`.
2. Remove the duplicate `rtk-cli-filter` catalog entry and reject duplicate skill IDs during parsing, with a test.
3. Preserve catalog role classification when an explicit/project-forced skill is selected; precedence changes ordering, not adjunct/reviewer role.
4. Unknown explicit skill IDs must fail closed: return no optional route rather than silently selecting an automatic skill.
5. Either normalize snake_case JSON fields correctly or remove the JSON parser claim; retain only behavior covered by tests.
6. Remove the duplicate unchecked Task 2 Step 5 in the implementation plan.

## Verification

Run focused Task 2 tests, full tests, typecheck, build, and `git diff --check`. Commit the fixes with a conventional `fix:` message and append the findings, tests, and commit to `.superpowers/sdd/task-2-report.md`.

Do not touch existing PDF/JSON files, RTK/global files, or unrelated task implementations.
