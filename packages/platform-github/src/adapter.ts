import type { PlatformAdapter } from "@schemend/core";
import { z } from "zod";
import { buildPushAuthEnv } from "./git-auth.js";
import { readGithubRepository, readGithubToken } from "./github-env.js";
import { githubRequest } from "./github-request.js";
import {
  PullRequestListSchema,
  PullRequestSchema,
  RepositorySchema,
} from "./github-schemas.js";

export class GitPushError extends Error {
  constructor(branch: string, detail: string) {
    super(`git push of branch "${branch}" failed: ${detail}`);
    this.name = "GitPushError";
  }
}

export class InvalidPrUrlError extends Error {
  constructor(url: string) {
    super(`not a recognizable GitHub pull request URL: ${url}`);
    this.name = "InvalidPrUrlError";
  }
}

/** Not every repo's default branch is "main" - exported for a future `schemend run` caller that needs a baseBranch and has none configured. */
export async function getDefaultBranch(
  owner: string,
  repo: string,
  token: string,
): Promise<string> {
  const repository = await githubRequest(
    token,
    "GET",
    `/repos/${owner}/${repo}`,
    RepositorySchema,
  );
  return repository.default_branch;
}

async function findOpenPr(
  token: string,
  owner: string,
  repo: string,
  branch: string,
  baseBranch: string,
) {
  const results = await githubRequest(
    token,
    "GET",
    `/repos/${owner}/${repo}/pulls?head=${owner}:${encodeURIComponent(branch)}&base=${encodeURIComponent(baseBranch)}&state=open`,
    PullRequestListSchema,
  );
  return results[0];
}

function parsePrUrl(url: string): {
  owner: string;
  repo: string;
  number: number;
} {
  const match = url.match(
    /^https:\/\/github\.com\/([^/]+)\/([^/]+)\/pull\/(\d+)/,
  );
  const [, owner, repo, numberText] = match ?? [];
  if (!owner || !repo || !numberText) throw new InvalidPrUrlError(url);
  return { owner, repo, number: Number(numberText) };
}

export const githubAdapter: PlatformAdapter = {
  id: "github",

  detectCi(env) {
    return env.GITHUB_ACTIONS === "true";
  },

  async pushBranch(root, branch, exec) {
    const authEnv = buildPushAuthEnv(readGithubToken());
    // Best-effort: refreshes the local remote-tracking ref so --force-with-lease has something
    // real to compare against; a non-zero exit here just means this is the branch's first push.
    await exec(`git -C ${root} fetch origin ${branch}`, authEnv);
    const result = await exec(
      `git -C ${root} push --force-with-lease origin ${branch}`,
      authEnv,
    );
    if (result.exitCode !== 0) {
      throw new GitPushError(branch, result.stderr || result.stdout);
    }
  },

  async openChangeRequest({ branch, baseBranch, title, body }) {
    const token = readGithubToken();
    const { owner, repo } = readGithubRepository();

    // A second run for the same branch updates the existing open PR instead of opening a
    // duplicate - the branch itself was already force-pushed with fresh commits by pushBranch.
    const existing = await findOpenPr(token, owner, repo, branch, baseBranch);
    if (existing) {
      const updated = await githubRequest(
        token,
        "PATCH",
        `/repos/${owner}/${repo}/pulls/${existing.number}`,
        PullRequestSchema,
        { title, body },
      );
      return { url: updated.html_url, number: updated.number };
    }

    const created = await githubRequest(
      token,
      "POST",
      `/repos/${owner}/${repo}/pulls`,
      PullRequestSchema,
      { title, head: branch, base: baseBranch, body },
    );
    return { url: created.html_url, number: created.number };
  },

  async comment(url, body) {
    const token = readGithubToken();
    const { owner, repo, number } = parsePrUrl(url);
    await githubRequest(
      token,
      "POST",
      `/repos/${owner}/${repo}/issues/${number}/comments`,
      z.unknown(),
      { body },
    );
  },
};
