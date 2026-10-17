import type { Exec } from "./context.js";

/** Read-only: lists any `http.*.extraheader` keys already configured for `root` (e.g. a CI checkout step's persisted token), without writing anything. */
export async function discoverExtraHeaderKeys(
  root: string,
  exec: Exec,
): Promise<string[]> {
  const result = await exec(
    `git -C ${root} config --get-regexp '^http\\..*\\.extraheader$'`,
  );
  if (result.exitCode !== 0) return [];
  return result.stdout
    .split("\n")
    .map((line) => line.split(" ")[0])
    .filter((key): key is string => Boolean(key));
}

/**
 * A one-shot `http.extraHeader` override for a single git invocation, passed as `Exec`'s `env`
 * (never the command string, never `.git/config`) - never persists to disk.
 *
 * `existingExtraHeaderKeys` (from discoverExtraHeaderKeys) matters because a URL-scoped key (e.g.
 * GitHub Actions' checkout step persists `http.https://github.com/.extraheader` by default) wins
 * over - and silently suppresses - a value given under the bare `http.extraHeader` key for the
 * same request; setting a key to an empty value resets *that* key's own accumulated list, but not
 * any other key, so our header has to be written under the exact same key(s) already present.
 * Verified against a real git invocation (GIT_CURL_VERBOSE): with a pre-existing
 * `http.https://github.com/.extraheader`, our own value under the bare key was never sent at all;
 * resetting then re-setting the same URL-scoped key sent exactly our value. When nothing is
 * discovered, the bare key is used, same as before.
 */
export function buildPushAuthEnv(
  username: string,
  token: string,
  existingExtraHeaderKeys: string[] = [],
): Record<string, string> {
  const header = `AUTHORIZATION: basic ${Buffer.from(`${username}:${token}`).toString("base64")}`;
  const keys =
    existingExtraHeaderKeys.length > 0
      ? existingExtraHeaderKeys
      : ["http.extraheader"];

  const env: Record<string, string> = {};
  let count = 0;
  for (const key of keys) {
    env[`GIT_CONFIG_KEY_${count}`] = key;
    env[`GIT_CONFIG_VALUE_${count}`] = "";
    count++;
    env[`GIT_CONFIG_KEY_${count}`] = key;
    env[`GIT_CONFIG_VALUE_${count}`] = header;
    count++;
  }
  env.GIT_CONFIG_COUNT = String(count);
  return env;
}

export class GitLsRemoteError extends Error {
  constructor(remote: string, branch: string, detail: string) {
    super(`git ls-remote ${remote} refs/heads/${branch} failed: ${detail}`);
    this.name = "GitLsRemoteError";
  }
}

/**
 * The remote's current sha for `branch` (via `git ls-remote`), or `undefined` if the branch
 * doesn't exist there yet (exit 0, no matching ref in the output). Exists because a fresh CI
 * clone has no local remote-tracking ref for a branch a *previous* run created - a bare
 * `--force-with-lease` has nothing to compare against and git refuses the push outright - so
 * callers build an explicit `--force-with-lease=<branch>:<sha>` from this instead of relying on
 * local tracking state.
 *
 * Always runs scoped to `root` (`git -C <root> ls-remote ...`), even when `remote` is a bare
 * name like "origin": without `-C`, the command resolves "origin" against whatever directory the
 * calling process happens to be in, not the repo being pushed - which can silently succeed
 * against a *different*, unrelated repository that also happens to have a remote by that name,
 * returning an empty (but exit-0) result that looks exactly like "branch doesn't exist yet".
 * Throws `GitLsRemoteError` on a non-zero exit instead of treating a real failure the same as
 * "branch doesn't exist" - the two must never be conflated, or a lookup failure silently turns
 * into an incorrect, too-permissive lease assertion.
 */
export async function getRemoteBranchSha(
  root: string,
  remote: string,
  branch: string,
  exec: Exec,
  env: Record<string, string>,
): Promise<string | undefined> {
  const result = await exec(
    `git -C ${root} ls-remote ${remote} refs/heads/${branch}`,
    env,
  );
  if (result.exitCode !== 0) {
    throw new GitLsRemoteError(remote, branch, result.stderr || result.stdout);
  }
  return result.stdout.trim().split("\n")[0]?.split(/\s+/)[0] || undefined;
}
