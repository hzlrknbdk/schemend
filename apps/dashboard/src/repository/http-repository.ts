import type { ApiEntry, Repository, RunReport } from "./types";

/**
 * Backs the "local" build: reads from `schemend ui`'s local server, embedded in
 * @schemend/cli. The server itself doesn't exist yet (v1.1) — this is the client side of
 * that contract, written against the endpoints it will expose.
 */
export class HttpRepository implements Repository {
	async listRuns(): Promise<RunReport[]> {
		const response = await fetch("/api/runs");
		if (!response.ok)
			throw new Error(`GET /api/runs failed: ${response.status}`);
		return response.json();
	}

	async listApis(): Promise<ApiEntry[]> {
		const response = await fetch("/api/apis");
		if (!response.ok)
			throw new Error(`GET /api/apis failed: ${response.status}`);
		return response.json();
	}
}
