/**
 * A one-shot `git` auth override, passed as `Exec`'s `env` (never the command string, never
 * `.git/config`): `GIT_CONFIG_*` makes `http.extraheader` apply only to the single process that
 * inherits this env, so the token never touches argv, disk, or any other command this `exec` runs.
 * `x-access-token` as the Basic-auth username (any non-empty value works) is GitHub's own
 * convention for token-based git-over-HTTPS.
 */
export function buildPushAuthEnv(token: string): Record<string, string> {
  const header = `AUTHORIZATION: basic ${Buffer.from(`x-access-token:${token}`).toString("base64")}`;
  return {
    GIT_CONFIG_COUNT: "1",
    GIT_CONFIG_KEY_0: "http.extraheader",
    GIT_CONFIG_VALUE_0: header,
  };
}
