import type { ChangeRequest, PlatformAdapter } from "@schemend/core";
import { discoverExtraHeaderKeys, getRemoteBranchSha } from "@schemend/core";
import { z } from "zod";
import { buildGitlabPushAuthEnv } from "./git-auth.js";
import {
  readGitlabProjectId,
  readGitlabProjectUrl,
  readGitlabToken,
} from "./gitlab-env.js";
import { gitlabRequest } from "./gitlab-request.js";
import {
  MergeRequestListSchema,
  MergeRequestSchema,
  ProjectSchema,
} from "./gitlab-schemas.js";

export class GitPushError extends Error {
  constructor(branch: string, detail: string) {
    super(`git push of branch "${branch}" failed: ${detail}`);
    this.name = "GitPushError";
  }
}

export class MissingChangeRequestNumberError extends Error {
  constructor() {
    super(
      "comment() needs a merge request iid - the ChangeRequest it was given has none.",
    );
    this.name = "MissingChangeRequestNumberError";
  }
}

/** Not every project's default branch is "main". Exported separately (not just via the adapter's own getDefaultBranch()) so a caller with a projectId/token already in hand doesn't have to go through env reading. */
export async function getDefaultBranch(
  projectId: string,
  token: string,
): Promise<string> {
  const project = await gitlabRequest(
    token,
    "GET",
    `/projects/${encodeURIComponent(projectId)}`,
    ProjectSchema,
  );
  return project.default_branch;
}

async function findOpenMr(
  token: string,
  projectId: string,
  branch: string,
  baseBranch: string,
) {
  const results = await gitlabRequest(
    token,
    "GET",
    `/projects/${encodeURIComponent(projectId)}/merge_requests?source_branch=${encodeURIComponent(branch)}&target_branch=${encodeURIComponent(baseBranch)}&state=opened`,
    MergeRequestListSchema,
  );
  return results[0];
}

function requireNumber(changeRequest: ChangeRequest): number {
  if (changeRequest.number === undefined) {
    throw new MissingChangeRequestNumberError();
  }
  return changeRequest.number;
}

export const gitlabAdapter: PlatformAdapter = {
  id: "gitlab",
  // GitLab's issuable (issue/MR/epic) description limit is ~1,048,576 bytes; kept with a margin,
  // same reasoning as GitHub's 65_000.
  maxBodyLength: 1_000_000,

  detectCi(env) {
    return env.GITLAB_CI === "true";
  },

  async getDefaultBranch() {
    return getDefaultBranch(readGitlabProjectId(), readGitlabToken());
  },

  async pushBranch(root, branch, exec) {
    // Pushes straight to an explicit, credential-free URL (CI_PROJECT_URL, never "origin") instead
    // of a named remote: GitLab CI's own clone step may have embedded CI_JOB_TOKEN (which usually
    // lacks push rights) directly in origin's configured remote URL, and unlike a config-based
    // credential (handled by discoverExtraHeaderKeys/buildPushAuthEnv below, same mechanism as the
    // GitHub adapter) there's no key to reset for that - pointing at a different URL entirely is
    // the only way around it.
    const url = `${readGitlabProjectUrl()}.git`;
    const existingKeys = await discoverExtraHeaderKeys(root, exec);
    const authEnv = buildGitlabPushAuthEnv(readGitlabToken(), existingKeys);
    // No named remote means no local remote-tracking ref either, so a bare --force-with-lease has
    // nothing to compare against. ls-remote gets the actual current value right before pushing
    // instead - see DECISIONS.md for what this does and doesn't protect against.
    const sha = await getRemoteBranchSha(root, url, branch, exec, authEnv);
    const result = await exec(
      `git -C ${root} push --force-with-lease=${branch}:${sha ?? ""} ${url} ${branch}`,
      authEnv,
    );
    if (result.exitCode !== 0) {
      throw new GitPushError(branch, result.stderr || result.stdout);
    }
  },

  async openChangeRequest({ branch, baseBranch, title, body }) {
    const token = readGitlabToken();
    const projectId = readGitlabProjectId();

    // A second run for the same branch updates the existing open MR instead of opening a
    // duplicate - the branch itself was already force-pushed with fresh commits by pushBranch.
    const existing = await findOpenMr(token, projectId, branch, baseBranch);
    if (existing) {
      const updated = await gitlabRequest(
        token,
        "PUT",
        `/projects/${encodeURIComponent(projectId)}/merge_requests/${existing.iid}`,
        MergeRequestSchema,
        { title, description: body },
      );
      return { url: updated.web_url, number: updated.iid };
    }

    const created = await gitlabRequest(
      token,
      "POST",
      `/projects/${encodeURIComponent(projectId)}/merge_requests`,
      MergeRequestSchema,
      {
        source_branch: branch,
        target_branch: baseBranch,
        title,
        description: body,
      },
    );
    return { url: created.web_url, number: created.iid };
  },

  async comment(changeRequest, body) {
    const token = readGitlabToken();
    const projectId = readGitlabProjectId();
    const iid = requireNumber(changeRequest);
    await gitlabRequest(
      token,
      "POST",
      `/projects/${encodeURIComponent(projectId)}/merge_requests/${iid}/notes`,
      z.unknown(),
      { body },
    );
  },
};
