import type { z } from "zod";
import { githubApiBase } from "./github-env.js";

export class GithubApiError extends Error {
  readonly status: number;

  constructor(method: string, path: string, status: number, body: string) {
    // GitHub returns 404 (not 403) for a private repo the token can't see, to avoid confirming it
    // exists - a plain "404" would send the user looking for a typo instead of a scope problem.
    const hint =
      status === 404
        ? " (repository not found, or the token doesn't have access to it)"
        : "";
    super(`GitHub API ${method} ${path} failed with ${status}${hint}: ${body}`);
    this.name = "GithubApiError";
    this.status = status;
  }
}

/** Never logs or embeds the Authorization header; `path`/`body` here are the request path and the response body, neither of which can contain the token. */
export async function githubRequest<T>(
  token: string,
  method: "GET" | "POST" | "PATCH" | "DELETE",
  path: string,
  schema: z.ZodType<T>,
  body?: unknown,
  env: NodeJS.ProcessEnv = process.env,
): Promise<T> {
  const response = await fetch(`${githubApiBase(env)}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });

  const text = await response.text();
  if (!response.ok) {
    throw new GithubApiError(method, path, response.status, text);
  }
  return schema.parse(text ? JSON.parse(text) : undefined);
}
