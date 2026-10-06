import { apis, runs } from "./fixtures";
import type { ApiEntry, Repository, RunReport } from "./types";

/** Backs the "demo" build: in-memory fixtures, no network. */
export class MockRepository implements Repository {
	async listRuns(): Promise<RunReport[]> {
		return runs;
	}

	async listApis(): Promise<ApiEntry[]> {
		return apis;
	}
}
