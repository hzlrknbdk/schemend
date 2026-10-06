import type { ApiEntry, RunReport } from "@schemend/core";

/**
 * How the dashboard reads schemend's data. `MockRepository` backs the "demo" build
 * (published at its own address, linked from the landing page); `HttpRepository` will back
 * the "local" build once `schemend ui` ships a local server to read from (v1.1).
 */
export interface Repository {
	listRuns(): Promise<RunReport[]>;
	listApis(): Promise<ApiEntry[]>;
}

export type { ApiEntry, RunReport, ServiceResult } from "@schemend/core";
