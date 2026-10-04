import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
	buildAgentTools,
	qualifiedToolName,
	TOOL_NAMES,
} from "./agent-tools.js";
import type { CheckResult } from "./types.js";

let root: string;

const stubAdapter = {
	build: async (): Promise<CheckResult> => ({
		name: "typecheck",
		status: "passed",
	}),
	test: async (): Promise<CheckResult> => ({ name: "test", status: "passed" }),
};

function findTool(
	tools: ReturnType<typeof buildAgentTools>["tools"],
	name: string,
) {
	const found = tools.find((t) => t.name === name);
	if (!found) throw new Error(`tool not found: ${name}`);
	return found;
}

beforeEach(async () => {
	root = await mkdtemp(path.join(tmpdir(), "schemend-agent-tools-"));
});

afterEach(async () => {
	await rm(root, { recursive: true, force: true });
});

describe("qualifiedToolName", () => {
	it("prefixes every tool name with the mcp wire format", () => {
		expect(qualifiedToolName("read_file")).toBe("mcp__schemend__read_file");
		expect(TOOL_NAMES.map(qualifiedToolName)).toEqual([
			"mcp__schemend__read_file",
			"mcp__schemend__edit_file",
			"mcp__schemend__run_build",
			"mcp__schemend__run_tests",
		]);
	});
});

describe("read_file", () => {
	it("returns the file's contents", async () => {
		await mkdir(path.join(root, "src"), { recursive: true });
		await writeFile(path.join(root, "src/a.ts"), "hello");
		const { tools } = buildAgentTools(
			{ root, exec: async () => ({ exitCode: 0, stdout: "", stderr: "" }) },
			stubAdapter,
			["src/a.ts"],
		);

		const result = await findTool(tools, "read_file").handler(
			{ path: "src/a.ts" },
			undefined,
		);

		expect(result.isError).toBeFalsy();
		expect(result.content).toEqual([{ type: "text", text: "hello" }]);
	});

	it("reports an error for a missing file instead of throwing", async () => {
		const { tools } = buildAgentTools(
			{ root, exec: async () => ({ exitCode: 0, stdout: "", stderr: "" }) },
			stubAdapter,
			[],
		);

		const result = await findTool(tools, "read_file").handler(
			{ path: "nope.ts" },
			undefined,
		);

		expect(result.isError).toBe(true);
	});
});

describe("edit_file", () => {
	it("writes the file and records it as changed when the path is affected", async () => {
		await mkdir(path.join(root, "src"), { recursive: true });
		await writeFile(path.join(root, "src/a.ts"), "old");
		const { tools, changedFiles } = buildAgentTools(
			{ root, exec: async () => ({ exitCode: 0, stdout: "", stderr: "" }) },
			stubAdapter,
			["src/a.ts"],
		);

		const result = await findTool(tools, "edit_file").handler(
			{ path: "src/a.ts", content: "new" },
			undefined,
		);

		expect(result.isError).toBeFalsy();
		expect(changedFiles).toEqual(new Set(["src/a.ts"]));
		expect(await readFile(path.join(root, "src/a.ts"), "utf-8")).toBe("new");
	});

	it("refuses to write a file that isn't in the affected list", async () => {
		await mkdir(path.join(root, "src"), { recursive: true });
		await writeFile(path.join(root, "src/other.ts"), "untouched");
		const { tools, changedFiles } = buildAgentTools(
			{ root, exec: async () => ({ exitCode: 0, stdout: "", stderr: "" }) },
			stubAdapter,
			["src/a.ts"],
		);

		const result = await findTool(tools, "edit_file").handler(
			{ path: "src/other.ts", content: "hacked" },
			undefined,
		);

		expect(result.isError).toBe(true);
		expect(changedFiles.size).toBe(0);
		expect(await readFile(path.join(root, "src/other.ts"), "utf-8")).toBe(
			"untouched",
		);
	});
});

describe("run_build / run_tests", () => {
	it("run_build calls adapter.build and reports a passed result", async () => {
		const { tools } = buildAgentTools(
			{ root, exec: async () => ({ exitCode: 0, stdout: "", stderr: "" }) },
			stubAdapter,
			[],
		);

		const result = await findTool(tools, "run_build").handler({}, undefined);

		expect(result.content).toEqual([
			{ type: "text", text: "typecheck: passed" },
		]);
	});

	it("run_tests surfaces a failing adapter.test result with its detail", async () => {
		const failingAdapter = {
			build: stubAdapter.build,
			test: async (): Promise<CheckResult> => ({
				name: "test",
				status: "failed",
				detail: "1 failing",
			}),
		};
		const { tools } = buildAgentTools(
			{ root, exec: async () => ({ exitCode: 0, stdout: "", stderr: "" }) },
			failingAdapter,
			[],
		);

		const result = await findTool(tools, "run_tests").handler({}, undefined);
		const block = result.content[0];
		const text = block?.type === "text" ? block.text : undefined;

		expect(text).toContain("test: failed");
		expect(text).toContain("1 failing");
	});
});
