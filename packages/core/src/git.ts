import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import type { Exec } from "./context.js";

export class GitRefNotFoundError extends Error {
  constructor(ref: string, relPath: string, detail: string) {
    super(`could not read "${relPath}" at ref "${ref}": ${detail}`);
    this.name = "GitRefNotFoundError";
  }
}

export class NotAGitRepositoryError extends Error {
  constructor(detail: string) {
    super(`not inside a git repository: ${detail}`);
    this.name = "NotAGitRepositoryError";
  }
}

/**
 * The repo root ensureDockerCtx (check.ts) mounts read-only for build/test/install, so a
 * consumer's schema reference outside its own directory (e.g. SPEC §5's "../orders/openapi.json")
 * still resolves. Relies on the same implicit-cwd convention as writeFileAtRef: `exec` is assumed
 * already scoped to the consumer root (the CLI's own process cwd - see packages/cli/src/index.ts).
 */
export async function findRepoRoot(exec: Exec): Promise<string> {
  const result = await exec("git rev-parse --show-toplevel");
  if (result.exitCode !== 0) {
    throw new NotAGitRepositoryError(result.stderr || result.stdout);
  }
  return result.stdout.trim();
}

/**
 * Writes `relPath` (relative to the current directory) as it existed at `ref` into a throwaway
 * temp file and returns its path. Used to get the "old" side of a schema diff (SPEC §2 step 2)
 * when the "new" side is simply the file's current content on disk; the caller removes the temp
 * dir when done. `:./` makes the path relative to the current directory rather than the repo
 * root, so this works the same whether the consumer is the whole repo or a subdirectory of it.
 */
export async function writeFileAtRef(
  ref: string,
  relPath: string,
  exec: Exec,
): Promise<string> {
  const result = await exec(`git show ${ref}:./${relPath}`);
  if (result.exitCode !== 0) {
    throw new GitRefNotFoundError(ref, relPath, result.stderr || result.stdout);
  }

  const tempDir = await mkdtemp(path.join(tmpdir(), "schemend-git-ref-"));
  const tempFile = path.join(tempDir, path.basename(relPath));
  await writeFile(tempFile, result.stdout);
  return tempFile;
}
