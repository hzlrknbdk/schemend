import { HttpRepository } from "./http-repository";
import { MockRepository } from "./mock-repository";
import type { Repository } from "./types";

export type {
	ApiEntry,
	CheckResult,
	Repository,
	RunReport,
	ServiceResult,
} from "./types";

/** Matches the build-time mode set by `vite.config.ts` (`VITE_SCHEMEND_MODE`, default "demo"). */
export function getRepository(): Repository {
	const mode = import.meta.env.VITE_SCHEMEND_MODE ?? "demo";
	return mode === "local" ? new HttpRepository() : new MockRepository();
}
