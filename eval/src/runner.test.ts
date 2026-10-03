import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { discoverScenarios, runScenario } from "./runner.js";
import type { Scenario } from "./scenario.js";
import type { Solver } from "./solver.js";

const tempDirs: string[] = [];

async function tempDir(): Promise<string> {
	const dir = await mkdtemp(path.join(tmpdir(), "schemend-eval-"));
	tempDirs.push(dir);
	return dir;
}

afterEach(async () => {
	await Promise.all(
		tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })),
	);
});

describe("discoverScenarios", () => {
	it("loads a scenario whose id matches its folder name", async () => {
		const scenariosDir = await tempDir();
		await mkdir(path.join(scenariosDir, "field-rename"));
		await writeFile(
			path.join(scenariosDir, "field-rename", "scenario.json"),
			JSON.stringify({
				id: "field-rename",
				description: "test",
				real: false,
				source: "schemend-demo",
				ref: "a1b2c3d",
				schemaBefore: "schema.before.json",
				schemaAfter: "schema.after.json",
				consumers: { "apps/checkout-web": { expected: "untouched" } },
			}),
		);

		const scenarios = await discoverScenarios(scenariosDir);
		expect(scenarios).toHaveLength(1);
		expect(scenarios[0]?.id).toBe("field-rename");
	});

	it("throws when the folder name does not match the scenario id", async () => {
		const scenariosDir = await tempDir();
		await mkdir(path.join(scenariosDir, "wrong-folder"));
		await writeFile(
			path.join(scenariosDir, "wrong-folder", "scenario.json"),
			JSON.stringify({
				id: "field-rename",
				description: "test",
				real: false,
				source: "schemend-demo",
				ref: "a1b2c3d",
				schemaBefore: "schema.before.json",
				schemaAfter: "schema.after.json",
				consumers: { "apps/checkout-web": { expected: "untouched" } },
			}),
		);

		await expect(discoverScenarios(scenariosDir)).rejects.toThrow(
			/does not match/,
		);
	});
});

describe("runScenario", () => {
	const scenario: Scenario = {
		id: "field-to-object",
		description: "test",
		real: false,
		source: "schemend-demo",
		ref: "a1b2c3d",
		schemaBefore: "schema.before.json",
		schemaAfter: "schema.after.json",
		consumers: {
			"apps/checkout-web": {
				expected: "fixed",
				mustNotContain: ["totalPrice"],
			},
		},
	};

	it("judges correct-fix when the forbidden string is gone from disk", async () => {
		const dir = await tempDir();
		await writeFile(path.join(dir, "page.ts"), "total.amount");
		const solver: Solver = async () => ({
			changedFiles: ["page.ts"],
			flags: [],
		});

		const rows = await runScenario(
			scenario,
			{ "apps/checkout-web": dir },
			solver,
		);
		expect(rows).toEqual([
			{
				scenarioId: "field-to-object",
				consumer: "apps/checkout-web",
				real: false,
				expected: "fixed",
				result: "correct-fix",
			},
		]);
	});

	it("judges wrong-fix when the forbidden string is still on disk", async () => {
		const dir = await tempDir();
		await writeFile(path.join(dir, "page.ts"), "totalPrice");
		const solver: Solver = async () => ({
			changedFiles: ["page.ts"],
			flags: [],
		});

		const rows = await runScenario(
			scenario,
			{ "apps/checkout-web": dir },
			solver,
		);
		expect(rows[0]?.result).toBe("wrong-fix");
	});
});
