import type { z } from "zod";
import { gitlabApiBase } from "./gitlab-env.js";

export class GitlabApiError extends Error {
  readonly status: number;

  constructor(method: string, path: string, status: number, body: string) {
    const hint =
      status === 404
        ? " (project not found, or the token doesn't have access to it)"
        : "";
    super(`GitLab API ${method} ${path} failed with ${status}${hint}: ${body}`);
    this.name = "GitlabApiError";
    this.status = status;
  }
}

/** Never logs or embeds the token; `path`/`body` here are the request path and the response body, neither of which can contain it. */
export async function gitlabRequest<T>(
  token: string,
  method: "GET" | "POST" | "PUT" | "DELETE",
  path: string,
  schema: z.ZodType<T>,
  body?: unknown,
  env: NodeJS.ProcessEnv = process.env,
): Promise<T> {
  const response = await fetch(`${gitlabApiBase(env)}${path}`, {
    method,
    headers: {
      "PRIVATE-TOKEN": token,
      ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });

  const text = await response.text();
  if (!response.ok) {
    throw new GitlabApiError(method, path, response.status, text);
  }
  return schema.parse(text ? JSON.parse(text) : undefined);
}
