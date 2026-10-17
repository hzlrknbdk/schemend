import { buildPushAuthEnv } from "@schemend/core";

/** `x-access-token` as the Basic-auth username (any non-empty value works) is GitHub's own convention for token-based git-over-HTTPS. */
export function buildGithubPushAuthEnv(
  token: string,
  existingExtraHeaderKeys: string[] = [],
): Record<string, string> {
  return buildPushAuthEnv("x-access-token", token, existingExtraHeaderKeys);
}
