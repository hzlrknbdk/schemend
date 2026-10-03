import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { runChecks } from "./checks.js";

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

describe("runChecks", () => {
	it("marks a zero-exit command as passed with no detail", async () => {
		const dir = await tempDir();
		const results = await runChecks(dir, ['node -e "process.exit(0)"']);
		expect(results).toEqual([
			{ name: 'node -e "process.exit(0)"', status: "passed" },
		]);
	});

	it("marks a non-zero-exit command as failed and attaches output as detail", async () => {
		const dir = await tempDir();
		const results = await runChecks(dir, [
			"node -e \"console.error('boom'); process.exit(1)\"",
		]);
		expect(results[0]?.status).toBe("failed");
		expect(results[0]?.detail).toContain("boom");
	});

	it("runs every command and reports each independently", async () => {
		const dir = await tempDir();
		const results = await runChecks(dir, [
			'node -e "process.exit(0)"',
			'node -e "process.exit(1)"',
		]);
		expect(results.map((r) => r.status)).toEqual(["passed", "failed"]);
	});
});
