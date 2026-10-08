import { env } from "@/env";
import {
	NetworkError,
	NotFoundError,
	ServerError,
	ValidationError,
} from "./errors";
import { apis, runs } from "./fixtures";
import type { ApiEntry, Repository, RunReport } from "./types";

const SLOW_DELAY_MS = 3000;

function delay(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Backs the "demo" build: in-memory fixtures, no network. `VITE_MOCK_SCENARIO` lets a route's
 * error/loading/empty states be exercised on demand (manual QA only — see conventions.md §11),
 * since real fixture data never fails or takes long to resolve on its own.
 */
export class MockRepository implements Repository {
	async listRuns(): Promise<RunReport[]> {
		await this.applyScenario();
		return env.VITE_MOCK_SCENARIO === "empty" ? [] : runs;
	}

	async listApis(): Promise<ApiEntry[]> {
		await this.applyScenario();
		return env.VITE_MOCK_SCENARIO === "empty" ? [] : apis;
	}

	private async applyScenario(): Promise<void> {
		switch (env.VITE_MOCK_SCENARIO) {
			case "slow":
				await delay(SLOW_DELAY_MS);
				return;
			case "network-error":
				throw new NetworkError(
					"Simulated network failure (VITE_MOCK_SCENARIO=network-error).",
				);
			case "not-found-error":
				throw new NotFoundError(
					"Simulated 404 (VITE_MOCK_SCENARIO=not-found-error).",
				);
			case "server-error":
				throw new ServerError(
					"Simulated server error (VITE_MOCK_SCENARIO=server-error).",
					500,
				);
			case "validation-error":
				throw new ValidationError(
					"Simulated malformed response (VITE_MOCK_SCENARIO=validation-error).",
					'Expected "startedAt" to be a string, received number at runs[0].startedAt.',
				);
			case "empty":
			case "default":
				return;
			default:
				return env.VITE_MOCK_SCENARIO satisfies never;
		}
	}
}
