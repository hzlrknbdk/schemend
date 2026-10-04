import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { ConfigSchema, ConfigValidationError, loadConfig } from "./config.js";

const tempDirs: string[] = [];

async function tempDir(): Promise<string> {
	const dir = await mkdtemp(path.join(tmpdir(), "schemend-core-"));
	tempDirs.push(dir);
	return dir;
}

afterEach(async () => {
	await Promise.all(
		tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })),
	);
});

async function writeConfig(dir: string, contents: string): Promise<string> {
	const configPath = path.join(dir, "schemend.config.ts");
	await writeFile(configPath, contents);
	return configPath;
}

describe("ConfigSchema", () => {
	it("accepts the SPEC §5 example", () => {
		const result = ConfigSchema.parse({
			apis: [
				{
					name: "orders",
					schema: "../orders/openapi.json",
					usedIn: ["src/lib"],
				},
			],
			test: "pnpm typecheck && pnpm test",
			platform: "github",
			budgetUsd: 1,
			models: { fix: "claude-sonnet-5", classify: "claude-haiku-4-5-20251001" },
		});
		expect(result.budgetUsd).toBe(1);
	});

	it("defaults budgetUsd to 1 when omitted", () => {
		const result = ConfigSchema.parse({
			apis: [],
			test: "pnpm test",
			platform: "github",
		});
		expect(result.budgetUsd).toBe(1);
	});

	it("defaults models when omitted", () => {
		const result = ConfigSchema.parse({
			apis: [],
			test: "pnpm test",
			platform: "github",
		});
		expect(result.models).toEqual({
			fix: "claude-sonnet-5",
			classify: "claude-haiku-4-5-20251001",
		});
	});

	it("rejects an unknown platform", () => {
		expect(() =>
			ConfigSchema.parse({
				apis: [],
				test: "pnpm test",
				platform: "bitbucket",
			}),
		).toThrow();
	});
});

describe("loadConfig", () => {
	it("loads and validates a schemend.config.ts file", async () => {
		const dir = await tempDir();
		const configPath = await writeConfig(
			dir,
			`export default {
	apis: [{ name: "orders", schema: "../orders/openapi.json", usedIn: ["src/lib"] }],
	test: "pnpm test",
	platform: "github",
};
`,
		);

		const config = await loadConfig(configPath);

		expect(config.platform).toBe("github");
		expect(config.budgetUsd).toBe(1);
		expect(config.models.fix).toBe("claude-sonnet-5");
	});

	it("rejects an invalid schemend.config.ts with a field-level message", async () => {
		const dir = await tempDir();
		const configPath = await writeConfig(
			dir,
			`export default {
	apis: [],
	test: "pnpm test",
	platform: "bitbucket",
};
`,
		);

		await expect(loadConfig(configPath)).rejects.toThrow(ConfigValidationError);
		await expect(loadConfig(configPath)).rejects.toThrow(/platform/);
	});
});
