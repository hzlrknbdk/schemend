import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { runFixAgent } from "./agent.js";
import { runCheck } from "./check.js";
import type { Config } from "./config.js";
import type { Exec, ExecResult } from "./context.js";
import type { LanguageAdapter } from "./language-adapter.js";
import { diffSchemas } from "./oasdiff.js";
import type { ApiChange, CheckResult } from "./types.js";

vi.mock("./oasdiff.js", () => ({ diffSchemas: vi.fn() }));
vi.mock("./agent.js", () => ({ runFixAgent: vi.fn() }));

const mockedDiff = vi.mocked(diffSchemas);
const mockedFixAgent = vi.mocked(runFixAgent);

let root: string;

beforeEach(async () => {
	root = await mkdtemp(path.join(tmpdir(), "schemend-check-"));
	mockedDiff.mockReset();
	mockedFixAgent.mockReset();
});

afterEach(async () => {
	await rm(root, { recursive: true, force: true });
});

const change: ApiChange = {
	id: "response-property-removed:GET:/orders#0",
	severity: "breaking",
	summary: "'totalPrice' was removed from the response",
	target: "GET /orders",
	source: { tool: "oasdiff", id: "response-property-removed", level: 2 },
};

function baseConfig(overrides: Partial<Config> = {}): Config {
	return {
		apis: [{ name: "orders", schema: "schema.json", usedIn: ["src/lib"] }],
		test: "pnpm test",
		platform: "github",
		budgetUsd: 1,
		models: { fix: "claude-sonnet-5", classify: "claude-haiku-4-5-20251001" },
		...overrides,
	};
}

function makeAdapter(
	overrides: Partial<LanguageAdapter> = {},
): LanguageAdapter {
	return {
		id: "fake",
		detect: async () => true,
		discoverApis: async () => [],
		findAffected: async () => [],
		build: async () =>
			({ name: "build", status: "passed" }) satisfies CheckResult,
		test: async () =>
			({ name: "test", status: "passed" }) satisfies CheckResult,
		...overrides,
	};
}

/**
 * A fake git/exec: "git show" backs writeFileAtRef (always succeeds with placeholder content),
 * "git diff --name-only --cached --relative" reports whatever files this test wants to appear
 * committed, everything else (add/checkout/commit) just succeeds. No real git repo needed.
 */
function fakeExec(changedFilesByCall: string[][]): Exec {
	let diffCall = 0;
	return async (command: string): Promise<ExecResult> => {
		if (command.startsWith("git show")) {
			return { exitCode: 0, stdout: "old schema", stderr: "" };
		}
		if (command.startsWith("git diff --name-only --cached --relative")) {
			const files = changedFilesByCall[diffCall] ?? [];
			diffCall += 1;
			return { exitCode: 0, stdout: files.join("\n"), stderr: "" };
		}
		return { exitCode: 0, stdout: "", stderr: "" };
	};
}

describe("runCheck", () => {
	it("reports nothing and spends nothing when the schema didn't change", async () => {
		mockedDiff.mockResolvedValue([]);
		const build = vi.fn(makeAdapter().build);
		const adapter = makeAdapter({ build });

		const report = await runCheck({
			config: baseConfig(),
			root,
			exec: fakeExec([]),
			adapters: [adapter],
		});

		expect(report.changes).toEqual([]);
		expect(report.services).toEqual([]);
		expect(report.spentUsd).toBe(0);
		expect(build).not.toHaveBeenCalled();
	});

	it("reports a baseline failure without regenerating or running the agent", async () => {
		mockedDiff.mockResolvedValue([change]);
		const regenerateClient = vi.fn();
		const findAffected = vi.fn(makeAdapter().findAffected);
		const adapter = makeAdapter({
			build: async () => ({ name: "build", status: "failed" }),
			regenerateClient,
			findAffected,
		});

		const report = await runCheck({
			config: baseConfig(),
			root,
			exec: fakeExec([]),
			adapters: [adapter],
		});

		expect(report.services).toHaveLength(1);
		expect(report.services[0]?.branch).toBe("");
		expect(report.services[0]?.confidence).toBe("unverified");
		expect(report.services[0]?.review[0]?.reason).toContain("baseline");
		expect(regenerateClient).not.toHaveBeenCalled();
		expect(findAffected).not.toHaveBeenCalled();
		expect(mockedFixAgent).not.toHaveBeenCalled();
	});

	it("regenerates and commits even when nothing needed fixing", async () => {
		mockedDiff.mockResolvedValue([change]);
		const regenerateClient = vi.fn(async () => {
			await writeFile(path.join(root, "generated.ts"), "regenerated");
		});
		const adapter = makeAdapter({
			regenerateClient,
			findAffected: async () => [],
		});

		const report = await runCheck({
			config: baseConfig(),
			root,
			exec: fakeExec([["generated.ts"]]),
			adapters: [adapter],
		});

		expect(regenerateClient).toHaveBeenCalledTimes(1);
		expect(mockedFixAgent).not.toHaveBeenCalled();
		expect(report.services[0]?.changedFiles).toEqual(["generated.ts"]);
		expect(report.services[0]?.branch).toBe("schemend/update");
		expect(report.services[0]?.confidence).toBe("verified-by-tests");
		expect(report.services[0]?.costUsd).toBe(0);
	});

	it("runs the fix agent when there are affected locations and reports its result", async () => {
		mockedDiff.mockResolvedValue([change]);
		mockedFixAgent.mockImplementation(async ({ budget }) => {
			await mkdir(path.join(root, "src"), { recursive: true });
			await writeFile(path.join(root, "src/a.ts"), "fixed");
			budget.record(0.05);
			return {
				changedFiles: ["src/a.ts"],
				checks: [{ name: "test", status: "passed" }],
				confidence: "verified-by-tests",
				costUsd: 0.05,
				review: [],
			};
		});
		const adapter = makeAdapter({
			findAffected: async () => [
				{ file: "src/a.ts", line: 1, changeId: change.id, snippet: "x" },
			],
		});

		const report = await runCheck({
			config: baseConfig(),
			root,
			exec: fakeExec([["src/a.ts"]]),
			adapters: [adapter],
		});

		expect(mockedFixAgent).toHaveBeenCalledTimes(1);
		expect(report.services[0]?.changedFiles).toEqual(["src/a.ts"]);
		expect(report.services[0]?.confidence).toBe("verified-by-tests");
		expect(report.services[0]?.costUsd).toBe(0.05);
		expect(report.spentUsd).toBeCloseTo(0.05);
	});

	it("stops once the shared budget is exhausted and reports the rest as skipped", async () => {
		mockedDiff.mockResolvedValue([change]);
		mockedFixAgent.mockImplementation(async ({ budget }) => {
			budget.record(1);
			return {
				changedFiles: [],
				checks: [],
				confidence: "unverified",
				costUsd: 1,
				review: [],
			};
		});
		const adapter = makeAdapter({
			findAffected: async () => [
				{ file: "src/a.ts", line: 1, changeId: change.id, snippet: "x" },
			],
		});

		const report = await runCheck({
			config: baseConfig({
				apis: [
					{ name: "orders", schema: "schema.json", usedIn: ["src/lib"] },
					{ name: "other", schema: "other.json", usedIn: ["src/lib"] },
				],
				budgetUsd: 1,
			}),
			root,
			exec: fakeExec([[], []]),
			adapters: [adapter],
		});

		expect(mockedFixAgent).toHaveBeenCalledTimes(1);
		expect(report.stoppedReason).toBe("budget exceeded");
		expect(report.services).toHaveLength(2);
		expect(report.services[1]?.review[0]?.reason).toContain("budget");
	});

	it("throws when no adapter recognizes the project", async () => {
		mockedDiff.mockResolvedValue([change]);
		const adapter = makeAdapter({ detect: async () => false });

		await expect(
			runCheck({
				config: baseConfig(),
				root,
				exec: fakeExec([]),
				adapters: [adapter],
			}),
		).rejects.toThrow(/no language adapter/);
	});
});
