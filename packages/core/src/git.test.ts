import { exec as execCallback } from "node:child_process";
import { mkdtemp, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { Exec, ExecResult } from "./context.js";
import {
  findRepoRoot,
  GitRefNotFoundError,
  GitRefResolutionError,
  NotAGitRepositoryError,
  resolveRef,
  writeFileAtRef,
} from "./git.js";

const tempDirs: string[] = [];

async function tempDir(): Promise<string> {
  const dir = await mkdtemp(path.join(tmpdir(), "schemend-core-git-"));
  tempDirs.push(dir);
  return dir;
}

afterEach(async () => {
  await Promise.all(
    tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })),
  );
});

function execIn(cwd: string): Exec {
  return (command) =>
    new Promise<ExecResult>((resolve) => {
      execCallback(command, { cwd }, (error, stdout, stderr) => {
        resolve({
          exitCode: !error
            ? 0
            : typeof error.code === "number"
              ? error.code
              : 1,
          stdout,
          stderr,
        });
      });
    });
}

/**
 * Runs with the test process's own cwd, never `root` - used to prove findRepoRoot/writeFileAtRef
 * work from an explicit `git -C <root>` in the command string itself, not because the exec they're
 * given happens to already be scoped to `root` (the bug class the 2026-10-17 git-exec convention
 * unification closes, see DECISIONS.md).
 */
function execUnscoped(): Exec {
  return (command) =>
    new Promise<ExecResult>((resolve) => {
      execCallback(command, {}, (error, stdout, stderr) => {
        resolve({
          exitCode: !error
            ? 0
            : typeof error.code === "number"
              ? error.code
              : 1,
          stdout,
          stderr,
        });
      });
    });
}

const GIT_ENV = "-c user.email=a@b.c -c user.name=a -c commit.gpgsign=false";

async function createRepoWithTwoCommits(): Promise<{
  root: string;
  firstRef: string;
}> {
  const root = await tempDir();
  const exec = execIn(root);
  await exec("git init -q");
  await writeFile(path.join(root, "schema.json"), "old");
  await exec("git add schema.json");
  await exec(`git ${GIT_ENV} commit -q -m first`);
  const firstRef = (await exec("git rev-parse HEAD")).stdout.trim();
  await writeFile(path.join(root, "schema.json"), "new");
  await exec("git add schema.json");
  await exec(`git ${GIT_ENV} commit -q -m second`);
  return { root, firstRef };
}

describe("writeFileAtRef", () => {
  it("writes the file's content as it was at the given ref, not the current one", async () => {
    const { root, firstRef } = await createRepoWithTwoCommits();
    const exec = execIn(root);

    const tempFile = await writeFileAtRef(root, firstRef, "schema.json", exec);

    expect(await readFile(tempFile, "utf-8")).toBe("old");
    await rm(path.dirname(tempFile), { recursive: true, force: true });
  });

  it("works for a file in a subdirectory, relative to root", async () => {
    const root = await tempDir();
    const exec = execIn(root);
    await exec("git init -q");
    await exec("mkdir -p src");
    await writeFile(path.join(root, "src/schema.json"), "old");
    await exec("git add src/schema.json");
    await exec(`git ${GIT_ENV} commit -q -m first`);
    const ref = (await exec("git rev-parse HEAD")).stdout.trim();
    await writeFile(path.join(root, "src/schema.json"), "new");

    const tempFile = await writeFileAtRef(root, ref, "src/schema.json", exec);

    expect(await readFile(tempFile, "utf-8")).toBe("old");
    await rm(path.dirname(tempFile), { recursive: true, force: true });
  });

  it("throws GitRefNotFoundError when the file didn't exist at that ref", async () => {
    const { root, firstRef } = await createRepoWithTwoCommits();
    const exec = execIn(root);

    await expect(
      writeFileAtRef(root, firstRef, "nope.json", exec),
    ).rejects.toThrow(GitRefNotFoundError);
  });

  it("still resolves the right repo when exec's own cwd is not root (explicit -C root)", async () => {
    const { root, firstRef } = await createRepoWithTwoCommits();
    const exec = execUnscoped();

    const tempFile = await writeFileAtRef(root, firstRef, "schema.json", exec);

    expect(await readFile(tempFile, "utf-8")).toBe("old");
    await rm(path.dirname(tempFile), { recursive: true, force: true });
  });
});

describe("findRepoRoot", () => {
  it("returns root, scoped via explicit -C even when exec's own cwd is not root", async () => {
    const { root } = await createRepoWithTwoCommits();
    const exec = execUnscoped();

    // git itself resolves symlinks (macOS's real tmpdir is /private/var/...), so compare against
    // root's own realpath rather than the mkdtemp-returned path.
    await expect(findRepoRoot(root, exec)).resolves.toBe(await realpath(root));
  });

  it("throws NotAGitRepositoryError when startDir is not inside a git repository", async () => {
    const dir = await tempDir();
    const exec = execUnscoped();

    await expect(findRepoRoot(dir, exec)).rejects.toThrow(
      NotAGitRepositoryError,
    );
  });
});

describe("resolveRef", () => {
  it("returns the same sha even after a later commit moves HEAD~1 forward", async () => {
    const { root, firstRef } = await createRepoWithTwoCommits();
    const exec = execIn(root);

    const resolvedBeforeThirdCommit = await resolveRef(root, "HEAD~1", exec);
    expect(resolvedBeforeThirdCommit).toBe(firstRef);

    // a third commit lands - the exact thing a prior api's own fix commit does mid-runCheck.
    // Re-evaluating the bare string "HEAD~1" now would resolve to the *second* commit instead;
    // the sha this function already returned must stay exactly what it was.
    await writeFile(path.join(root, "schema.json"), "newer");
    await exec("git add schema.json");
    await exec(`git ${GIT_ENV} commit -q -m third`);

    expect(resolvedBeforeThirdCommit).toBe(firstRef);
    await expect(resolveRef(root, "HEAD~1", exec)).resolves.not.toBe(firstRef);
  });

  it("throws GitRefResolutionError when the ref doesn't exist", async () => {
    const root = await tempDir();
    const exec = execIn(root);
    await exec("git init -q");
    await writeFile(path.join(root, "schema.json"), "old");
    await exec("git add schema.json");
    await exec(`git ${GIT_ENV} commit -q -m only`);

    // only one commit exists - HEAD~1 doesn't resolve to anything.
    await expect(resolveRef(root, "HEAD~1", exec)).rejects.toThrow(
      GitRefResolutionError,
    );
  });

  it("still resolves the right repo when exec's own cwd is not root (explicit -C root)", async () => {
    const { root, firstRef } = await createRepoWithTwoCommits();
    const exec = execUnscoped();

    await expect(resolveRef(root, "HEAD~1", exec)).resolves.toBe(firstRef);
  });
});
