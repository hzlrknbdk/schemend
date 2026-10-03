import { mkdtemp, realpath, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { runCommand } from "./exec.js";

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

describe("runCommand", () => {
	it("resolves with exitCode 0 and captured stdout on success", async () => {
		const dir = await tempDir();
		const result = await runCommand('node -e "console.log(1)"', dir);
		expect(result.exitCode).toBe(0);
		expect(result.stdout.trim()).toBe("1");
	});

	it("resolves (does not reject) with a non-zero exitCode on failure", async () => {
		const dir = await tempDir();
		const result = await runCommand('node -e "process.exit(3)"', dir);
		expect(result.exitCode).toBe(3);
	});

	it("runs the command with the given cwd", async () => {
		const dir = await tempDir();
		const result = await runCommand("pwd", dir);
		// Resolve both sides: tmpdir() can be behind a symlink (e.g. /var -> /private/var on macOS).
		expect(await realpath(result.stdout.trim())).toBe(await realpath(dir));
	});

	it("kills a command that outlives its timeout and returns a numeric exitCode", async () => {
		const dir = await tempDir();
		const result = await runCommand(
			'node -e "setTimeout(() => {}, 5000)"',
			dir,
			50,
		);
		expect(result.exitCode).toBe(124);
	});
});
