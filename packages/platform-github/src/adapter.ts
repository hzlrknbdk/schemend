import type { ChangeRequest, PlatformAdapter } from "@schemend/core";
import { discoverExtraHeaderKeys, getRemoteBranchSha } from "@schemend/core";
import { z } from "zod";
import { buildGithubPushAuthEnv } from "./git-auth.js";
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

export class MissingChangeRequestNumberError extends Error {
  constructor() {
    super(
      "comment() needs a pull request number - the ChangeRequest it was given has none.",
    );
    this.name = "MissingChangeRequestNumberError";
  }
}

/** Not every repo's default branch is "main". Exported separately (not just via the adapter's own getDefaultBranch()) so a caller with an owner/repo/token already in hand doesn't have to go through env reading. */
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

function requireNumber(changeRequest: ChangeRequest): number {
  if (changeRequest.number === undefined) {
    throw new MissingChangeRequestNumberError();
  }
  return changeRequest.number;
}

export const githubAdapter: PlatformAdapter = {
  id: "github",
  maxBodyLength: 65_000,

  detectCi(env) {
    return env.GITHUB_ACTIONS === "true";
  },

  async getDefaultBranch() {
    const { owner, repo } = readGithubRepository();
    return getDefaultBranch(owner, repo, readGithubToken());
  },

  async pushBranch(root, branch, exec) {
    // actions/checkout persists its own token into .git/config by default (persist-credentials),
    // as a URL-scoped http.extraHeader - which silently wins over (not "also sends", just
    // suppresses) a value given under the bare key, so our header has to go under that same key.
    // See buildPushAuthEnv's doc comment for how this was verified.
    const existingKeys = await discoverExtraHeaderKeys(root, exec);
    const authEnv = buildGithubPushAuthEnv(readGithubToken(), existingKeys);
    // A fresh CI checkout has no local remote-tracking ref for a branch a *previous* run created,
    // so a bare --force-with-lease has nothing to compare against and git refuses the push
    // outright. ls-remote gets the actual current value right before pushing instead - see
    // DECISIONS.md for what this does and doesn't protect against.
    const sha = await getRemoteBranchSha(root, "origin", branch, exec, authEnv);
    const result = await exec(
      `git -C ${root} push --force-with-lease=${branch}:${sha ?? ""} origin ${branch}`,
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

  async comment(changeRequest, body) {
    const token = readGithubToken();
    const { owner, repo } = readGithubRepository();
    const number = requireNumber(changeRequest);
    await githubRequest(
      token,
      "POST",
      `/repos/${owner}/${repo}/issues/${number}/comments`,
      z.unknown(),
      { body },
    );
  },
};
