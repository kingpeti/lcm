import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { describe, expect, inject, it, vi } from "vitest";
import { finishFileTmpDir, finishRunRoot } from "./setup-global.js";

describe("per-file temp dir", () => {
  it("is this file's own dir under the run root, in the worker and in its children", () => {
    const runRoot = inject("lcmTestRunRoot");
    expect(dirname(runRoot)).toBe(resolve(process.env.LCM_TEST_REAL_TMPDIR ?? ""));
    expect(dirname(tmpdir())).toBe(runRoot);
    expect(basename(tmpdir())).toMatch(/^f-/);
    // os.tmpdir() reads one of these, but a child may read any of them: on Windows Node prefers
    // TEMP, while GetTempPathW (.NET, PowerShell, SQLite's temp files) prefers TMP.
    const fileTmpDir = tmpdir();
    const { TMPDIR, TMP, TEMP } = process.env;
    expect({ TMPDIR, TMP, TEMP }).toEqual({ TMPDIR: fileTmpDir, TMP: fileTmpDir, TEMP: fileTmpDir });
    const report = "const { TMPDIR, TMP, TEMP } = process.env; process.stdout.write(JSON.stringify({ tmpdir: require('node:os').tmpdir(), TMPDIR, TMP, TEMP }))";
    const child: unknown = JSON.parse(execFileSync(process.execPath, ["-e", report], { encoding: "utf8" }));
    expect(child).toEqual({ tmpdir: fileTmpDir, TMPDIR: fileTmpDir, TMP: fileTmpDir, TEMP: fileTmpDir });
  });

  it("stops git discovery at a ceiling written the way the run root is", () => {
    expect(process.env.GIT_CEILING_DIRECTORIES).toBe(inject("lcmTestRunRoot"));
    // Both the run root and this ceiling are path.join results under os.tmpdir(), so a form Git
    // for Windows misreads (separators, drive letter, short names) fails here too.
    const outer = mkdtempSync(join(tmpdir(), "git-outer-"));
    execFileSync("git", ["init", "-q"], { cwd: outer });
    const ceiling = join(outer, "ceiling");
    const inner = join(ceiling, "inner");
    mkdirSync(inner, { recursive: true });
    const gitDir = (env: NodeJS.ProcessEnv) => spawnSync("git", ["rev-parse", "--git-dir"], { cwd: inner, env, encoding: "utf8" });
    // The inherited ceiling sits above `outer`, so a repository a test makes is still found.
    expect(gitDir(process.env).status).toBe(0);
    const stopped = gitDir({ ...process.env, GIT_CEILING_DIRECTORIES: ceiling });
    expect(stopped.status).not.toBe(0);
    expect(stopped.stderr).toContain("not a git repository");
  });
});

describe("run root teardown", () => {
  const runRootWithEntry = (): string => {
    const root = mkdtempSync(join(tmpdir(), "lv-teardown-"));
    writeFileSync(join(root, "held"), "");
    return root;
  };
  const heldOpen = (): void => {
    throw Object.assign(new Error("EBUSY: resource busy or locked"), { code: "EBUSY" });
  };

  it("removes the run root", () => {
    const root = runRootWithEntry();
    finishRunRoot(root, {});
    expect(existsSync(root)).toBe(false);
  });

  it("fails a CI run when the run root cannot be removed", () => {
    const root = runRootWithEntry();
    expect(() => finishRunRoot(root, { CI: "true" }, heldOpen)).toThrow(`could not remove ${root}, 1 entries left: EBUSY`);
  });

  it("only warns locally when the run root cannot be removed", () => {
    const root = runRootWithEntry();
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      expect(() => finishRunRoot(root, {}, heldOpen)).not.toThrow();
      expect(warn).toHaveBeenCalledWith(expect.stringContaining(`could not remove ${root}, 1 entries left: EBUSY`));
    } finally {
      warn.mockRestore();
    }
  });

  it("keeps the run root with LCM_TEST_KEEP_TMP=1, even under CI", () => {
    const root = runRootWithEntry();
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      finishRunRoot(root, { CI: "true", LCM_TEST_KEEP_TMP: "1" });
      expect(existsSync(root)).toBe(true);
      expect(warn).toHaveBeenCalledWith(expect.stringContaining(`kept ${root}`));
    } finally {
      warn.mockRestore();
    }
  });

  it("keeps a file's own dir and what is in it with LCM_TEST_KEEP_TMP=1, and removes it otherwise", () => {
    const fileDir = runRootWithEntry();
    finishFileTmpDir(fileDir, { LCM_TEST_KEEP_TMP: "1" });
    expect(existsSync(join(fileDir, "held"))).toBe(true);
    finishFileTmpDir(fileDir, {});
    expect(existsSync(fileDir)).toBe(false);
  });
});
