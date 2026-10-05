import { exec as execCallback } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { Exec, ExecResult } from "./context.js";
import { GitRefNotFoundError, writeFileAtRef } from "./git.js";

const tempDirs: string[] = [];

async function tempDir(): Promise<string> {
	const dir = await mkdtemp(path.join(tmpdir(), "schemend-core-git-"));
	tempDirs.push(dir);
	return dir;
}

afterEach(async () => {
	await Promise.all(
		tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })),
	);
});

function execIn(cwd: string): Exec {
	return (command) =>
		new Promise<ExecResult>((resolve) => {
			execCallback(command, { cwd }, (error, stdout, stderr) => {
				resolve({
					exitCode: !error
						? 0
						: typeof error.code === "number"
							? error.code
							: 1,
					stdout,
					stderr,
				});
			});
		});
}

const GIT_ENV = "-c user.email=a@b.c -c user.name=a -c commit.gpgsign=false";

async function createRepoWithTwoCommits(): Promise<{
	root: string;
	firstRef: string;
}> {
	const root = await tempDir();
	const exec = execIn(root);
	await exec("git init -q");
	await writeFile(path.join(root, "schema.json"), "old");
	await exec("git add schema.json");
	await exec(`git ${GIT_ENV} commit -q -m first`);
	const firstRef = (await exec("git rev-parse HEAD")).stdout.trim();
	await writeFile(path.join(root, "schema.json"), "new");
	await exec("git add schema.json");
	await exec(`git ${GIT_ENV} commit -q -m second`);
	return { root, firstRef };
}

describe("writeFileAtRef", () => {
	it("writes the file's content as it was at the given ref, not the current one", async () => {
		const { root, firstRef } = await createRepoWithTwoCommits();
		const exec = execIn(root);

		const tempFile = await writeFileAtRef(firstRef, "schema.json", exec);

		expect(await readFile(tempFile, "utf-8")).toBe("old");
		await rm(path.dirname(tempFile), { recursive: true, force: true });
	});

	it("works for a file in a subdirectory, relative to the exec's own cwd", async () => {
		const root = await tempDir();
		const exec = execIn(root);
		await exec("git init -q");
		await exec("mkdir -p src");
		await writeFile(path.join(root, "src/schema.json"), "old");
		await exec("git add src/schema.json");
		await exec(`git ${GIT_ENV} commit -q -m first`);
		const ref = (await exec("git rev-parse HEAD")).stdout.trim();
		await writeFile(path.join(root, "src/schema.json"), "new");

		const tempFile = await writeFileAtRef(ref, "src/schema.json", exec);

		expect(await readFile(tempFile, "utf-8")).toBe("old");
		await rm(path.dirname(tempFile), { recursive: true, force: true });
	});

	it("throws GitRefNotFoundError when the file didn't exist at that ref", async () => {
		const { root, firstRef } = await createRepoWithTwoCommits();
		const exec = execIn(root);

		await expect(writeFileAtRef(firstRef, "nope.json", exec)).rejects.toThrow(
			GitRefNotFoundError,
		);
	});
});
