import type { AdapterContext } from "./context.js";
import type {
	AffectedLocation,
	ApiChange,
	ApiEntry,
	CheckResult,
} from "./types.js";

/** One language's discovery, impact analysis, build and test logic; core never imports ts-morph, Maven or dotnet directly. */
export interface LanguageAdapter {
	id: string;
	detect(root: string): Promise<boolean>;
	discoverApis(ctx: AdapterContext): Promise<ApiEntry[]>;
	regenerateClient?(ctx: AdapterContext, api: ApiEntry): Promise<void>;
	findAffected(
		ctx: AdapterContext,
		api: ApiEntry,
		changes: ApiChange[],
	): Promise<AffectedLocation[]>;
	build(ctx: AdapterContext): Promise<CheckResult>;
	test(ctx: AdapterContext): Promise<CheckResult>;
}
