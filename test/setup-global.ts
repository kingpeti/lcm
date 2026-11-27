import { existsSync, mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { TestProject } from "vitest/node";

declare module "vitest" {
  export interface ProvidedContext {
    lcmTestRunRoot: string;
  }
}

// The live hooks keep their session claims, restore locks and snapshots in the real temp dir.
// One run root per project, with a directory per test file inside it (test/setup-env.ts), keeps
// everything a test writes to os.tmpdir() out of there, and what a test leaves behind (a file
// Windows still holds open, a child that outlived its test) is removed with the root.
export default function setup(project: TestProject): () => void {
  const runRoot = mkdtempSync(join(tmpdir(), "lv-"));
  project.provide("lcmTestRunRoot", runRoot);
  return () => finishRunRoot(runRoot);
}

/**
 * Removes the run root. What cannot be removed fails the run under CI and only warns locally,
 * where Windows file locks are common; LCM_TEST_KEEP_TMP=1 keeps the root and the file dirs in
 * it (see finishFileTmpDir) for debugging.
 */
export function finishRunRoot(
  runRoot: string,
  env: NodeJS.ProcessEnv = process.env,
  remove: (path: string) => void = (path) => rmSync(path, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }),
): void {
  if (env.LCM_TEST_KEEP_TMP === "1") {
    console.warn(`[lcm test temp] kept ${runRoot} (LCM_TEST_KEEP_TMP=1)`);
    return;
  }
  let failure = "";
  try {
    remove(runRoot);
  } catch (error) {
    failure = `: ${(error as Error).message}`;
  }
  if (!existsSync(runRoot)) return;
  const message = `[lcm test temp] could not remove ${runRoot}, ${readdirSync(runRoot).length} entries left${failure}`;
  if (env.CI) throw new Error(message);
  console.warn(message);
}

/** Removes a test file's own temp dir, unless LCM_TEST_KEEP_TMP=1 keeps it in the kept run root. */
export function finishFileTmpDir(fileTmpDir: string, env: NodeJS.ProcessEnv = process.env): void {
  if (env.LCM_TEST_KEEP_TMP === "1") return;
  try {
    rmSync(fileTmpDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
  } catch {
    // A file Windows still holds open: the run root's teardown removes it later or reports it.
  }
}
