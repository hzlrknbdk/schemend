import { existsSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("./exec.js", () => ({ runCommand: vi.fn() }));

import { runScenarioInWorktree } from "./cli.js";
import type { CommandResult } from "./exec.js";
import { runCommand } from "./exec.js";
import type { Scenario } from "./scenario.js";

afterEach(() => {
	vi.mocked(runCommand).mockReset();
});

function ok(stdout = ""): CommandResult {
	return { exitCode: 0, stdout, stderr: "" };
}

function fail(stdout = "", stderr = ""): CommandResult {
	return { exitCode: 1, stdout, stderr };
}

describe("runScenarioInWorktree", () => {
	it("marks the consumer invalid and never calls the solver when baseline checks fail", async () => {
		vi.mocked(runCommand).mockImplementation(async (command, _cwd) => {
			const addMatch = command.match(/^git worktree add --detach "([^"]+)"/);
			if (addMatch?.[1]) {
				await mkdir(addMatch[1], { recursive: true });
				return ok();
			}
			if (command.startsWith("git worktree remove")) return ok();
			if (command === "baseline-check") return fail("baseline is broken");
			return ok();
		});

		const solver = vi.fn(async () => ({ changedFiles: [], flags: [] }));
		const scenario: Scenario = {
			id: "whatever",
			description: "test",
			real: false,
			source: "schemend-demo",
			ref: "deadbeef",
			providerSchema: "schema-after-copy.json",
			schemaBefore: "schema.before.json",
			schemaAfter: "schema.after.json",
			consumers: {
				"apps/checkout-web": {
					expected: "fixed",
					checks: ["baseline-check"],
					mustNotContain: ["totalPrice"],
				},
			},
		};

		const rows = await runScenarioInWorktree(scenario, solver);

		expect(rows).toEqual([
			{
				scenarioId: "whatever",
				consumer: "apps/checkout-web",
				real: false,
				expected: "fixed",
				result: "invalid",
				checks: [
					{
						name: "baseline-check",
						status: "failed",
						detail: "baseline is broken",
					},
				],
			},
		]);
		expect(solver).not.toHaveBeenCalled();
	});

	it("runs setup both before and after schemaAfter is applied", async () => {
		const providerSchema = "schema-after-copy.json";
		const sawSchemaApplied: boolean[] = [];

		vi.mocked(runCommand).mockImplementation(async (command, cwd) => {
			const addMatch = command.match(/^git worktree add --detach "([^"]+)"/);
			if (addMatch?.[1]) {
				await mkdir(addMatch[1], { recursive: true });
				return ok();
			}
			if (command.startsWith("git worktree remove")) return ok();
			if (command === "record-setup") {
				await mkdir(cwd, { recursive: true });
				const worktreeDir = path.dirname(cwd);
				sawSchemaApplied.push(
					existsSync(path.join(worktreeDir, providerSchema)),
				);
				return ok();
			}
			if (command === "baseline-ok") return ok();
			return ok();
		});

		// Reuses the real field-rename fixture's schema.after.json as the copy source;
		// everything else about this scenario is synthetic.
		const scenario: Scenario = {
			id: "field-rename",
			description: "test",
			real: false,
			source: "schemend-demo",
			ref: "deadbeef",
			providerSchema,
			schemaBefore: "schema.before.json",
			schemaAfter: "schema.after.json",
			consumers: {
				consumer: {
					expected: "fixed",
					setup: ["record-setup"],
					checks: ["baseline-ok"],
					mustNotContain: ["totalPrice"],
				},
			},
		};

		await runScenarioInWorktree(scenario, async () => ({
			changedFiles: [],
			flags: [],
		}));

		expect(sawSchemaApplied).toEqual([false, true]);
	});
});
