export class MissingGitlabTokenError extends Error {
  constructor() {
    super(
      "GITLAB_TOKEN is not set. schemend needs a token (project or personal access token, " +
        "scopes api + write_repository) to call the GitLab API - export one yourself, GitLab CI's " +
        "own CI_JOB_TOKEN is not used because it usually can't open merge requests.",
    );
    this.name = "MissingGitlabTokenError";
  }
}

export class MissingGitlabProjectError extends Error {
  constructor(value: string | undefined) {
    super(
      `CI_PROJECT_ID must be set, either the numeric id or a "namespace/project" path ` +
        `(GitLab CI sets the numeric id automatically); got ${JSON.stringify(value)}.`,
    );
    this.name = "MissingGitlabProjectError";
  }
}

export class MissingGitlabProjectUrlError extends Error {
  constructor() {
    super(
      "CI_PROJECT_URL is not set (GitLab CI sets this automatically; elsewhere, export the " +
        "project's web URL yourself). Needed to push without relying on whatever credentials " +
        "GitLab CI's own checkout may have left in this clone.",
    );
    this.name = "MissingGitlabProjectUrlError";
  }
}

export function readGitlabToken(env: NodeJS.ProcessEnv = process.env): string {
  const token = env.GITLAB_TOKEN;
  if (!token) throw new MissingGitlabTokenError();
  return token;
}

/** The GitLab API's `:id` path parameter accepts either the numeric project id or a URL-encoded "namespace/project" path - this returns whichever string was given, raw; callers encodeURIComponent it when building a request path. */
export function readGitlabProjectId(
  env: NodeJS.ProcessEnv = process.env,
): string {
  const value = env.CI_PROJECT_ID;
  if (!value) throw new MissingGitlabProjectError(value);
  return value;
}

export function readGitlabProjectUrl(
  env: NodeJS.ProcessEnv = process.env,
): string {
  const value = env.CI_PROJECT_URL;
  if (!value) throw new MissingGitlabProjectUrlError();
  return value;
}

/** GitLab CI sets this automatically; for a self-hosted instance it's the instance's own URL, not gitlab.com. */
export function gitlabApiBase(env: NodeJS.ProcessEnv = process.env): string {
  return env.CI_API_V4_URL || "https://gitlab.com/api/v4";
}
