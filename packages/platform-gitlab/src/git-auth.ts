import { buildPushAuthEnv } from "@schemend/core";

/** `oauth2` as the Basic-auth username (any non-empty value works - GitLab doesn't check it for a project/personal access token) is GitLab's own documented convention for token-based git-over-HTTPS. */
export function buildGitlabPushAuthEnv(
  token: string,
  existingExtraHeaderKeys: string[] = [],
): Record<string, string> {
  return buildPushAuthEnv("oauth2", token, existingExtraHeaderKeys);
}
