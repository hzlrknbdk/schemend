import { env } from "@/env";
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

export function getRepository(): Repository {
	return env.VITE_SCHEMEND_MODE === "local"
		? new HttpRepository()
		: new MockRepository();
}
