import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { query } from "@anthropic-ai/claude-agent-sdk";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { runFixAgent } from "./agent.js";
import { Budget } from "./budget.js";
import type { AffectedLocation, ApiChange, CheckResult } from "./types.js";

vi.mock("@anthropic-ai/claude-agent-sdk", async (importOriginal) => {
	const actual =
		await importOriginal<typeof import("@anthropic-ai/claude-agent-sdk")>();
	return { ...actual, query: vi.fn() };
});

const mockedQuery = vi.mocked(query);

function fakeQuery(messages: unknown[]) {
	return (async function* () {
		for (const message of messages) yield message;
		// biome-ignore lint/suspicious/noExplicitAny: test double for the SDK's AsyncGenerator-shaped Query return type.
	})() as any;
}

function resultMessage(overrides: Record<string, unknown> = {}) {
	return {
		type: "result",
		subtype: "success",
		total_cost_usd: 0.05,
		is_error: false,
		...overrides,
	};
}

let root: string;

const passingAdapter = {
	build: async (): Promise<CheckResult> => ({
		name: "typecheck",
		status: "passed",
	}),
	test: async (): Promise<CheckResult> => ({ name: "test", status: "passed" }),
};

const change: ApiChange = {
	id: "response-property-removed:GET:/orders#0",
	severity: "breaking",
	summary: "'totalPrice' was removed from the response",
	target: "GET /orders",
	source: { tool: "oasdiff", id: "response-property-removed", level: 2 },
};

const affected: AffectedLocation[] = [
	{
		file: "src/lib/shipping.ts",
		line: 6,
		changeId: change.id,
		snippet: "return order.totalPrice >= FREE_SHIPPING_THRESHOLD;",
	},
];

beforeEach(async () => {
	root = await mkdtemp(path.join(tmpdir(), "schemend-agent-"));
	await mkdir(path.join(root, "src/lib"), { recursive: true });
	await writeFile(path.join(root, "src/lib/shipping.ts"), "old content");
	mockedQuery.mockReset();
});

afterEach(async () => {
	await rm(root, { recursive: true, force: true });
});

function ctx() {
	return { root, exec: async () => ({ exitCode: 0, stdout: "", stderr: "" }) };
}

describe("runFixAgent", () => {
	it("skips the agent when the budget is already exhausted", async () => {
		const budget = new Budget(1);
		budget.record(1);

		const result = await runFixAgent({
			ctx: ctx(),
			adapter: passingAdapter,
			affected,
			changes: [change],
			budget,
			model: "claude-sonnet-5",
		});

		expect(mockedQuery).not.toHaveBeenCalled();
		expect(result.review[0]?.reason).toContain("budget");
	});

	it("runs the query, records cost, and reports verified-by-tests on a clean fix", async () => {
		mockedQuery.mockImplementation(() => {
			return fakeQuery([resultMessage({ total_cost_usd: 0.12 })]);
		});
		const budget = new Budget(1);

		const result = await runFixAgent({
			ctx: ctx(),
			adapter: passingAdapter,
			affected,
			changes: [change],
			budget,
			model: "claude-sonnet-5",
		});

		expect(mockedQuery).toHaveBeenCalledTimes(1);
		const options = mockedQuery.mock.calls[0]?.[0]?.options;
		expect(options?.tools).toEqual([
			"mcp__schemend__read_file",
			"mcp__schemend__edit_file",
			"mcp__schemend__run_build",
			"mcp__schemend__run_tests",
		]);
		expect(options?.maxBudgetUsd).toBe(1);
		expect(budget.spent).toBeCloseTo(0.12);
		expect(result.costUsd).toBeCloseTo(0.12);
		expect(result.confidence).toBe("verified-by-tests");
	});

	it("flags budget-exceeded in review without throwing", async () => {
		mockedQuery.mockImplementation(() =>
			fakeQuery([
				resultMessage({ subtype: "error_max_budget_usd", total_cost_usd: 1 }),
			]),
		);

		const result = await runFixAgent({
			ctx: ctx(),
			adapter: passingAdapter,
			affected,
			changes: [change],
			budget: new Budget(1),
			model: "claude-sonnet-5",
		});

		expect(result.review[0]?.reason).toContain("budget exceeded");
		expect(result.costUsd).toBe(1);
	});

	it("reports verified-by-build when tests fail but the build still passes", async () => {
		mockedQuery.mockImplementation(() => fakeQuery([resultMessage()]));
		const adapter = {
			build: passingAdapter.build,
			test: async (): Promise<CheckResult> => ({
				name: "test",
				status: "failed" as const,
			}),
		};

		const result = await runFixAgent({
			ctx: ctx(),
			adapter,
			affected,
			changes: [change],
			budget: new Budget(1),
			model: "claude-sonnet-5",
		});

		expect(result.confidence).toBe("verified-by-build");
	});

	it("reports unverified when both build and tests fail after the fix", async () => {
		mockedQuery.mockImplementation(() => fakeQuery([resultMessage()]));
		const adapter = {
			build: async (): Promise<CheckResult> => ({
				name: "typecheck",
				status: "failed" as const,
			}),
			test: async (): Promise<CheckResult> => ({
				name: "test",
				status: "failed" as const,
			}),
		};

		const result = await runFixAgent({
			ctx: ctx(),
			adapter,
			affected,
			changes: [change],
			budget: new Budget(1),
			model: "claude-sonnet-5",
		});

		expect(result.confidence).toBe("unverified");
	});

	it("only records changes made to files in the affected list", async () => {
		mockedQuery.mockImplementation(() => fakeQuery([resultMessage()]));

		const result = await runFixAgent({
			ctx: ctx(),
			adapter: passingAdapter,
			affected,
			changes: [change],
			budget: new Budget(1),
			model: "claude-sonnet-5",
		});

		// The mocked query never actually calls edit_file, so nothing should be reported changed.
		expect(result.changedFiles).toEqual([]);
		expect(
			await readFile(path.join(root, "src/lib/shipping.ts"), "utf-8"),
		).toBe("old content");
	});
});
