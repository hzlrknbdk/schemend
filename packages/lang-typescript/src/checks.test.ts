import type { Exec, ExecResult } from "@schemend/core";
import { describe, expect, it } from "vitest";
import { build, test as runTest } from "./checks.js";

function ok(stdout = ""): ExecResult {
	return { exitCode: 0, stdout, stderr: "" };
}

function failed(stderr: string, exitCode = 1): ExecResult {
	return { exitCode, stdout: "", stderr };
}

describe("build", () => {
	it("runs the typecheck script and reports passed on exit 0", async () => {
		let command = "";
		const exec: Exec = async (cmd) => {
			command = cmd;
			return ok();
		};

		const result = await build({ root: "/tmp/consumer", exec });

		expect(command).toBe("pnpm run typecheck");
		expect(result).toEqual({ name: "typecheck", status: "passed" });
	});

	it("reports failed with stderr as detail on a non-zero exit", async () => {
		const exec: Exec = async () => failed("src/x.ts:1:1 - error TS2339");

		const result = await build({ root: "/tmp/consumer", exec });

		expect(result.status).toBe("failed");
		expect(result.detail).toContain("TS2339");
	});
});

describe("test", () => {
	it("runs the test script and reports passed on exit 0", async () => {
		let command = "";
		const exec: Exec = async (cmd) => {
			command = cmd;
			return ok();
		};

		const result = await runTest({ root: "/tmp/consumer", exec });

		expect(command).toBe("pnpm test");
		expect(result).toEqual({ name: "test", status: "passed" });
	});

	it("reports failed on a non-zero exit", async () => {
		const exec: Exec = async () => failed("1 failing");

		const result = await runTest({ root: "/tmp/consumer", exec });

		expect(result.status).toBe("failed");
		expect(result.detail).toContain("1 failing");
	});
});
