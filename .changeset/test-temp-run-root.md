---
"@lossless-claude/lcm": patch
---

chore: each test file gets its own temp directory under one run root

Tests wrote to the real temp directory, which the live hooks share for their session claims,
restore locks and snapshots, and whatever a test could not remove (on Windows, often a file still
held open) stayed there after the run.

`test/setup-global.ts` now makes one run root (`lv-*`) per vitest project, and `test/setup-env.ts`
gives each test file its own directory inside it (`f-*`), pointing `TMPDIR`, `TMP` and `TEMP` there
for the file and every child it spawns, with `GIT_CEILING_DIRECTORIES` set to the run root so Git
never looks above it for a repository. Each file removes its directory, and teardown removes the
root: what cannot be removed fails the run when `CI` is set and is reported as a warning locally.
`LCM_TEST_KEEP_TMP=1` keeps the root and each file's directory in it, with what that file's tests
left there, for debugging. vitest's cache stays in the real temp directory.

Test infrastructure only: nothing about the emitted CLI or the daemon changes.
