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
 * Backs the "local" build: reads from `schemend ui`'s local server, embedded in
 * @schemend/cli. The server itself doesn't exist yet (v1.1) — this is the client side of
 * that contract, written against the endpoints it will expose (see
 * docs/local-server-contract.md). Responses are parsed through schemas.ts, not trusted as
 * `response.json()`'s `any` — a malformed/outdated server response throws a ValidationError
 * instead of silently flowing on as a wrongly-typed value. Every failure mode throws one of
 * errors.ts's RepositoryError subclasses, never a plain Error, so a route's errorComponent can
 * always normalize and pick a message by `kind`. The access token (see auth-token.ts) is read
 * from the URL fragment once, on construction, kept in memory only, and sent as a Bearer token
 * on every request — never persisted, never put back in the URL.
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
