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
				mustNotContain: [".totalPrice"],
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
		await writeFile(path.join(dir, "page.ts"), "order.totalPrice");
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

	it("does not flag a bare identifier that merely shares the field's name", async () => {
		const dir = await tempDir();
		await writeFile(
			path.join(dir, "shipping.test.ts"),
			"const order = (totalPrice: number) => ({ total: { amount: totalPrice } });",
		);
		const solver: Solver = async () => ({
			changedFiles: ["shipping.test.ts"],
			flags: [],
		});

		const rows = await runScenario(
			scenario,
			{ "apps/checkout-web": dir },
			solver,
		);
		expect(rows[0]?.result).toBe("correct-fix");
	});

	it("ignores forbidden strings inside node_modules", async () => {
		const dir = await tempDir();
		await mkdir(path.join(dir, "node_modules", "some-pkg"), {
			recursive: true,
		});
		await writeFile(
			path.join(dir, "node_modules", "some-pkg", "index.js"),
			"order.totalPrice",
		);
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
		expect(rows[0]?.result).toBe("correct-fix");
	});

	it("ignores forbidden strings inside the generated orders-api.d.ts", async () => {
		const dir = await tempDir();
		await writeFile(path.join(dir, "orders-api.d.ts"), "order.totalPrice");
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
		expect(rows[0]?.result).toBe("correct-fix");
	});

	it("does not flag a different field that merely shares the needle's prefix", async () => {
		const dir = await tempDir();
		await writeFile(path.join(dir, "page.ts"), "order.totalPriceWithTax");
		const solver: Solver = async () => ({
			changedFiles: ["page.ts"],
			flags: [],
		});

		const rows = await runScenario(
			scenario,
			{ "apps/checkout-web": dir },
			solver,
		);
		expect(rows[0]?.result).toBe("correct-fix");
	});

	const flaggedScenario: Scenario = {
		id: "required-param-added",
		description: "test",
		real: false,
		source: "schemend-demo",
		ref: "a1b2c3d",
		schemaBefore: "schema.before.json",
		schemaAfter: "schema.after.json",
		consumers: {
			"apps/checkout-web": {
				expected: "flagged",
				flagContains: "warehouseId",
			},
		},
	};

	it("judges correct-flag end to end when the solver only flags a flagged consumer", async () => {
		const dir = await tempDir();
		const solver: Solver = async () => ({
			changedFiles: [],
			flags: [{ file: "page.ts", reason: "needs warehouseId, can't infer it" }],
		});

		const rows = await runScenario(
			flaggedScenario,
			{ "apps/checkout-web": dir },
			solver,
		);
		expect(rows[0]?.result).toBe("correct-flag");
	});

	it("judges wrong-fix end to end when the solver changes a flagged consumer", async () => {
		const dir = await tempDir();
		await writeFile(path.join(dir, "page.ts"), "order.warehouseId");
		const solver: Solver = async () => ({
			changedFiles: ["page.ts"],
			flags: [{ file: "page.ts", reason: "needs warehouseId, can't infer it" }],
		});

		const rows = await runScenario(
			flaggedScenario,
			{ "apps/checkout-web": dir },
			solver,
		);
		expect(rows[0]?.result).toBe("wrong-fix");
	});

	const untouchedScenario: Scenario = {
		id: "field-rename",
		description: "test",
		real: false,
		source: "schemend-demo",
		ref: "a1b2c3d",
		schemaBefore: "schema.before.json",
		schemaAfter: "schema.after.json",
		consumers: {
			"services/invoice": { expected: "untouched" },
		},
	};

	it("judges correct-untouched end to end when the solver leaves the consumer alone", async () => {
		const dir = await tempDir();
		const rows = await runScenario(
			untouchedScenario,
			{ "services/invoice": dir },
			async () => ({ changedFiles: [], flags: [] }),
		);
		expect(rows[0]?.result).toBe("correct-untouched");
	});

	it("judges overreach end to end when the solver touches an untouched consumer", async () => {
		const dir = await tempDir();
		const rows = await runScenario(
			untouchedScenario,
			{ "services/invoice": dir },
			async () => ({ changedFiles: ["Invoice.java"], flags: [] }),
		);
		expect(rows[0]?.result).toBe("overreach");
	});
});
