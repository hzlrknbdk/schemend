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

/** The repo root ensureDockerCtx mounts read-only, so a sibling schema reference (SPEC §5) still resolves. `exec` is assumed already scoped to the consumer root, same convention as writeFileAtRef. */
export async function findRepoRoot(exec: Exec): Promise<string> {
  const result = await exec("git rev-parse --show-toplevel");
  if (result.exitCode !== 0) {
    throw new NotAGitRepositoryError(result.stderr || result.stdout);
  }
  return result.stdout.trim();
}

/** Writes `relPath` as it existed at `ref` into a throwaway temp file for the "old" side of a schema diff (SPEC §2 step 2); the caller removes the temp dir. `:./` keeps the path relative to cwd, not the repo root. */
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
