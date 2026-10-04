import { createJiti } from "jiti";
import { z } from "zod";

const ApiConfigSchema = z.object({
	name: z.string(),
	schema: z.string(),
	usedIn: z.array(z.string()),
});

const ModelsConfigSchema = z.object({
	fix: z.string(),
	classify: z.string(),
});

const DEFAULT_MODELS = {
	fix: "claude-sonnet-5",
	classify: "claude-haiku-4-5-20251001",
} as const;

/** schemend.config.ts shape (SPEC §5); budgetUsd and models fall back to defaults when omitted. */
export const ConfigSchema = z.object({
	apis: z.array(ApiConfigSchema),
	test: z.string(),
	platform: z.enum(["github", "gitlab"]),
	budgetUsd: z.number().positive().default(1),
	models: ModelsConfigSchema.default(DEFAULT_MODELS),
});

export type Config = z.infer<typeof ConfigSchema>;

/** Identity function; exists only so schemend.config.ts gets type checking and autocomplete. */
export function defineConfig(
	config: z.input<typeof ConfigSchema>,
): z.input<typeof ConfigSchema> {
	return config;
}

function formatIssues(error: z.ZodError): string {
	return error.issues
		.map((issue) => {
			const field = issue.path.length > 0 ? issue.path.join(".") : "(root)";
			return `  - ${field}: ${issue.message}`;
		})
		.join("\n");
}

/** Thrown by loadConfig() when schemend.config.ts fails validation; message lists each bad field. */
export class ConfigValidationError extends Error {
	constructor(configPath: string, error: z.ZodError) {
		super(`invalid config at ${configPath}:\n${formatIssues(error)}`);
		this.name = "ConfigValidationError";
	}
}

/**
 * Loads and validates schemend.config.ts. Uses jiti instead of a native import() because Node's
 * built-in TypeScript support isn't enabled by default on every Node 22 release this CLI supports.
 */
export async function loadConfig(configPath: string): Promise<Config> {
	const jiti = createJiti(import.meta.url);
	const mod = await jiti.import(configPath, { default: true });
	const result = ConfigSchema.safeParse(mod);
	if (!result.success) {
		throw new ConfigValidationError(configPath, result.error);
	}
	return result.data;
}
