import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { runCommand } from "./exec.js";
import { createWorktree } from "./worktree.js";

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

async function sh(command: string, cwd: string): Promise<void> {
	const result = await runCommand(command, cwd);
	if (result.exitCode !== 0) {
		throw new Error(`${command} failed: ${result.stderr || result.stdout}`);
	}
}

const GIT_ENV = "-c user.email=a@b.c -c user.name=a -c commit.gpgsign=false";

async function createThrowawayRepo(): Promise<{
	repoRoot: string;
	firstSha: string;
}> {
	const repoRoot = await tempDir();
	await sh("git init -q", repoRoot);
	await writeFile(path.join(repoRoot, "marker.txt"), "first");
	await sh("git add marker.txt", repoRoot);
	await sh(`git ${GIT_ENV} commit -q -m first`, repoRoot);
	const first = await runCommand("git rev-parse HEAD", repoRoot);
	const firstSha = first.stdout.trim();
	await writeFile(path.join(repoRoot, "marker.txt"), "second");
	await sh("git add marker.txt", repoRoot);
	await sh(`git ${GIT_ENV} commit -q -m second`, repoRoot);
	return { repoRoot, firstSha };
}

describe("createWorktree", () => {
	it("checks out the pinned ref, not the repo's current HEAD", async () => {
		const { repoRoot, firstSha } = await createThrowawayRepo();
		const worktree = await createWorktree(repoRoot, firstSha);
		try {
			const content = await readFile(
				path.join(worktree.dir, "marker.txt"),
				"utf8",
			);
			expect(content).toBe("first");
		} finally {
			await worktree.cleanup();
		}
	});

	it("cleanup removes the worktree from the repo's worktree list", async () => {
		const { repoRoot, firstSha } = await createThrowawayRepo();
		const worktree = await createWorktree(repoRoot, firstSha);
		await worktree.cleanup();

		const list = await runCommand("git worktree list", repoRoot);
		expect(list.stdout).not.toContain(worktree.dir);
	});
});
