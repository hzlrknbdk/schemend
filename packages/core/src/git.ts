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

export class GitRefResolutionError extends Error {
  constructor(ref: string, detail: string) {
    super(`could not resolve git ref "${ref}": ${detail}`);
    this.name = "GitRefResolutionError";
  }
}

/**
 * Resolves `ref` (e.g. the default "HEAD~1") to a concrete commit sha, once, before runCheck's
 * api loop starts. "HEAD~1" as a bare string is relative to whatever HEAD *currently* is - every
 * api that successfully commits a fix moves HEAD forward by one before the next api's turn, so
 * re-resolving the same string per api would silently see the *previous* api's own fix commit as
 * the baseline instead of the real pre-change state, missing that api's schema change entirely
 * when several schemas change together in one commit (a real product bug, see DECISIONS.md).
 */
export async function resolveRef(
  root: string,
  ref: string,
  exec: Exec,
): Promise<string> {
  const result = await exec(`git -C ${root} rev-parse ${ref}`);
  if (result.exitCode !== 0) {
    throw new GitRefResolutionError(ref, result.stderr || result.stdout);
  }
  return result.stdout.trim();
}

/** The repo root ensureDockerCtx mounts read-only, so a sibling schema reference (SPEC §5) still resolves. Always runs scoped via explicit `git -C <startDir>`, same convention as every other git call in this file and in git-push-auth.ts - never relies on exec's own cwd happening to already be startDir. */
export async function findRepoRoot(
  startDir: string,
  exec: Exec,
): Promise<string> {
  const result = await exec(`git -C ${startDir} rev-parse --show-toplevel`);
  if (result.exitCode !== 0) {
    throw new NotAGitRepositoryError(result.stderr || result.stdout);
  }
  return result.stdout.trim();
}

/** Writes `relPath` as it existed at `ref` into a throwaway temp file for the "old" side of a schema diff (SPEC §2 step 2); the caller removes the temp dir. `:./` keeps the path relative to `root`, not wherever exec's own cwd happens to be - explicit `-C <root>` same reasoning as findRepoRoot. */
export async function writeFileAtRef(
  root: string,
  ref: string,
  relPath: string,
  exec: Exec,
): Promise<string> {
  const result = await exec(`git -C ${root} show ${ref}:./${relPath}`);
  if (result.exitCode !== 0) {
    throw new GitRefNotFoundError(ref, relPath, result.stderr || result.stdout);
  }

  const tempDir = await mkdtemp(path.join(tmpdir(), "schemend-git-ref-"));
  const tempFile = path.join(tempDir, path.basename(relPath));
  await writeFile(tempFile, result.stdout);
  return tempFile;
}
