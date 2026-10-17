export class MissingGithubTokenError extends Error {
  constructor() {
    super(
      "GITHUB_TOKEN is not set. schemend needs a token to call the GitHub API " +
        "(GitHub Actions sets this automatically for GITHUB_TOKEN; elsewhere, export one yourself).",
    );
    this.name = "MissingGithubTokenError";
  }
}

export class MissingGithubRepositoryError extends Error {
  constructor(value: string | undefined) {
    super(
      `GITHUB_REPOSITORY must be set as "owner/repo" (GitHub Actions sets this automatically); got ${JSON.stringify(value)}.`,
    );
    this.name = "MissingGithubRepositoryError";
  }
}

export function readGithubToken(env: NodeJS.ProcessEnv = process.env): string {
  const token = env.GITHUB_TOKEN;
  if (!token) throw new MissingGithubTokenError();
  return token;
}

export interface GithubRepository {
  owner: string;
  repo: string;
}

export function readGithubRepository(
  env: NodeJS.ProcessEnv = process.env,
): GithubRepository {
  const value = env.GITHUB_REPOSITORY;
  const match = value?.match(/^([^/\s]+)\/([^/\s]+)$/);
  if (!match) throw new MissingGithubRepositoryError(value);
  const [, owner, repo] = match;
  if (!owner || !repo) throw new MissingGithubRepositoryError(value);
  return { owner, repo };
}

/** GitHub Actions sets this to the correct value for both github.com and GitHub Enterprise Server. */
export function githubApiBase(env: NodeJS.ProcessEnv = process.env): string {
  return env.GITHUB_API_URL || "https://api.github.com";
}
