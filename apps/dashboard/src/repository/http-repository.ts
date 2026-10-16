import { z } from "zod";
import { consumeTokenFromUrl, getAuthToken } from "./auth-token";
import {
  AuthError,
  NetworkError,
  NotFoundError,
  ServerError,
  ValidationError,
} from "./errors";
import { ApiEntryListSchema, RunReportListSchema } from "./schemas";
import type { ApiEntry, Repository, RunReport } from "./types";

const REOPEN_HINT = "Open the URL schemend ui printed when it started.";

async function fetchJson(path: string): Promise<unknown> {
  const token = getAuthToken();
  if (!token) {
    throw new AuthError(`No access token. ${REOPEN_HINT}`);
  }

  let response: Response;
  try {
    response = await fetch(path, {
      headers: { Authorization: `Bearer ${token}` },
    });
  } catch {
    throw new NetworkError(`Could not reach ${path}.`);
  }
  if (response.status === 401) {
    throw new AuthError(`The server rejected the access token. ${REOPEN_HINT}`);
  }
  if (response.status === 404) throw new NotFoundError(`${path} returned 404.`);
  if (!response.ok)
    throw new ServerError(
      `${path} failed: ${response.status}`,
      response.status,
    );
  return response.json();
}

function parse<T>(schema: z.ZodType<T>, body: unknown, path: string): T {
  try {
    return schema.parse(body);
  } catch (error) {
    throw new ValidationError(
      `${path} returned data in an unexpected shape.`,
      error instanceof z.ZodError ? error.message : String(error),
    );
  }
}

/**
 * Backs the "local" build: reads from `schemend ui`'s local server (doesn't exist yet, v1.1 -
 * written against docs/local-server-contract.md). Responses are parsed through schemas.ts, not
 * trusted as `response.json()`'s `any`; every failure throws an errors.ts RepositoryError
 * subclass, never a plain Error. The access token (auth-token.ts) is kept in memory only.
 */
export class HttpRepository implements Repository {
  constructor() {
    consumeTokenFromUrl();
  }

  async listRuns(): Promise<RunReport[]> {
    return parse(
      RunReportListSchema,
      await fetchJson("/api/runs"),
      "/api/runs",
    );
  }

  async listApis(): Promise<ApiEntry[]> {
    return parse(ApiEntryListSchema, await fetchJson("/api/apis"), "/api/apis");
  }
}
