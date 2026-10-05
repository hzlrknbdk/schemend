import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import type { Exec, ExecResult } from "@schemend/core";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { build, test as runTest } from "./checks.js";

let root: string;

beforeEach(async () => {
	root = await mkdtemp(path.join(tmpdir(), "schemend-lang-ts-checks-"));
});

afterEach(async () => {
	await rm(root, { recursive: true, force: true });
});

function ok(stdout = ""): ExecResult {
	return { exitCode: 0, stdout, stderr: "" };
}

function failed(stderr: string, exitCode = 1): ExecResult {
	return { exitCode, stdout: "", stderr };
}

function recordingExec(commands: string[]): Exec {
	return async (cmd) => {
		commands.push(cmd);
		return ok();
	};
}

describe("build", () => {
	it("runs the typecheck script and reports passed on exit 0", async () => {
		const commands: string[] = [];

		const result = await build({ root, exec: recordingExec(commands) });

		expect(commands).toEqual(["pnpm run typecheck"]);
		expect(result).toEqual({ name: "typecheck", status: "passed" });
	});

	it("reports failed with stderr as detail on a non-zero exit", async () => {
		const exec: Exec = async () => failed("src/x.ts:1:1 - error TS2339");

		const result = await build({ root, exec });

		expect(result.status).toBe("failed");
		expect(result.detail).toContain("TS2339");
	});

	it("runs `next typegen` before typecheck in a Next.js project", async () => {
		await writeFile(path.join(root, "next.config.ts"), "export default {};\n");
		const commands: string[] = [];

		await build({ root, exec: recordingExec(commands) });

		expect(commands).toEqual(["pnpm exec next typegen", "pnpm run typecheck"]);
	});

	it("does not run `next typegen` outside a Next.js project", async () => {
		const commands: string[] = [];

		await build({ root, exec: recordingExec(commands) });

		expect(commands).toEqual(["pnpm run typecheck"]);
	});
});

describe("test", () => {
	it("runs the test script and reports passed on exit 0", async () => {
		const commands: string[] = [];

		const result = await runTest({ root, exec: recordingExec(commands) });

		expect(commands).toEqual(["pnpm test"]);
		expect(result).toEqual({ name: "test", status: "passed" });
	});

	it("reports failed on a non-zero exit", async () => {
		const exec: Exec = async () => failed("1 failing");

		const result = await runTest({ root, exec });

		expect(result.status).toBe("failed");
		expect(result.detail).toContain("1 failing");
	});
});
