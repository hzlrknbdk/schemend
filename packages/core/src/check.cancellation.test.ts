import { exec as execCallback } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { AbortError, query } from "@anthropic-ai/claude-agent-sdk";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { runCheck } from "./check.js";
import type { Config } from "./config.js";
import type { Exec, ExecResult } from "./context.js";
import type { LanguageAdapter } from "./language-adapter.js";
import { diffSchemas } from "./oasdiff.js";
import type { ApiChange } from "./types.js";

// Real git, real filesystem, real runFixAgent (only the SDK's query() is faked) - this is the
// one place that answers "what does cancellation actually leave behind on disk/in git", which
// check.test.ts's fakeExec + mocked runFixAgent can't show.
vi.mock("./oasdiff.js", () => ({ diffSchemas: vi.fn() }));
vi.mock("@anthropic-ai/claude-agent-sdk", async (importOriginal) => {
	const actual =
		await importOriginal<typeof import("@anthropic-ai/claude-agent-sdk")>();
	return { ...actual, query: vi.fn() };
});

const mockedDiff = vi.mocked(diffSchemas);
const mockedQuery = vi.mocked(query);

function fakeQueryThenAbort(messages: unknown[]) {
	return (async function* () {
		for (const message of messages) yield message;
		throw new AbortError();
		// biome-ignore lint/suspicious/noExplicitAny: test double for the SDK's AsyncGenerator-shaped Query return type.
	})() as any;
}

const tempDirs: string[] = [];

async function tempDir(): Promise<string> {
	const dir = await mkdtemp(path.join(tmpdir(), "schemend-cancel-"));
	tempDirs.push(dir);
	return dir;
}

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

/** Two commits: HEAD~1 is the "old" schema writeFileAtRef reads, HEAD is the "new" one on disk. */
async function createRepo(): Promise<{ root: string; exec: Exec }> {
	const root = await tempDir();
	const exec = execIn(root);
	await exec("git init -q");
	await mkdir(path.join(root, "src"), { recursive: true });
	await writeFile(path.join(root, "schema.json"), "old");
	await writeFile(path.join(root, "src/a.ts"), "original content");
	await exec("git add -A");
	await exec(`git ${GIT_ENV} commit -q -m first`);
	await writeFile(path.join(root, "schema.json"), "new");
	await exec("git add -A");
	await exec(`git ${GIT_ENV} commit -q -m second`);
	return { root, exec };
}

const change: ApiChange = {
	id: "response-property-removed:GET:/orders#0",
	severity: "breaking",
	summary: "'totalPrice' was removed from the response",
	target: "GET /orders",
	source: { tool: "oasdiff", id: "response-property-removed", level: 2 },
};

function baseConfig(): Config {
	return {
		apis: [{ name: "orders", schema: "schema.json", usedIn: ["src"] }],
		test: "pnpm test",
		platform: "github",
		budgetUsd: 1,
		models: { fix: "claude-sonnet-5", classify: "claude-haiku-4-5-20251001" },
	};
}

function fakeAdapter(): LanguageAdapter {
	return {
		id: "fake",
		detect: async () => true,
		discoverApis: async () => [],
		findAffected: async () => [
			{ file: "src/a.ts", line: 1, changeId: change.id, snippet: "x" },
		],
		build: async () => ({ name: "build", status: "passed" }),
		test: async () => ({ name: "test", status: "passed" }),
	};
}

beforeEach(() => {
	mockedDiff.mockReset();
	mockedQuery.mockReset();
});

afterEach(async () => {
	await Promise.all(
		tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })),
	);
});

describe("runCheck cancellation mid-fix: what's left on disk and in git", () => {
	it("keeps the agent's edit, commits it to schemend/update, and leaves a clean working tree", async () => {
		mockedDiff.mockResolvedValue([change]);
		mockedQuery.mockImplementation(() =>
			fakeQueryThenAbort([
				{
					type: "assistant",
					message: {
						content: [
							{
								type: "tool_use",
								id: "tu_1",
								name: "mcp__schemend__edit_file",
								input: { path: "src/a.ts", content: "edited by agent" },
							},
						],
					},
				},
				{
					type: "user",
					message: {
						content: [
							{
								type: "tool_result",
								tool_use_id: "tu_1",
								content: [{ type: "text", text: "wrote src/a.ts" }],
								is_error: false,
							},
						],
					},
				},
			]),
		);

		const { root, exec } = await createRepo();
		// The mocked query() only replays messages - it never actually invokes buildAgentTools'
		// real edit_file handler (that's the live SDK's job). agent-tools.test.ts already proves
		// edit_file itself writes real content; this simulates "the agent's edit already landed
		// on disk" so this test can focus on what the orchestration does with it once cancelled.
		await writeFile(path.join(root, "src/a.ts"), "edited by agent");

		const report = await runCheck({
			config: baseConfig(),
			root,
			exec,
			adapters: [fakeAdapter()],
		});

		// The edit is still there after cancellation - nothing reverts it.
		expect(await readFile(path.join(root, "src/a.ts"), "utf-8")).toBe(
			"edited by agent",
		);

		// It's committed, not left dangling uncommitted: the working tree is clean.
		const status = await exec("git status --short");
		expect(status.stdout.trim()).toBe("");

		// It landed on schemend/update (the one branch this run ever creates), not main.
		const branch = await exec("git branch --show-current");
		expect(branch.stdout.trim()).toBe("schemend/update");
		const log = await exec("git log schemend/update --oneline");
		expect(log.stdout).toContain("schemend: update for orders change");

		// No worktree was ever created for this - only the main one exists.
		const worktrees = await exec("git worktree list");
		expect(worktrees.stdout.trim().split("\n")).toHaveLength(1);

		// The report is honest about what happened: flagged, not silently treated as done.
		expect(report.stoppedReason).toBe("cancelled");
		const service = report.services[0];
		expect(service?.branch).toBe("schemend/update");
		expect(service?.changedFiles).toEqual(["src/a.ts"]);
		expect(service?.confidence).toBe("unverified");
		expect(service?.review[0]?.reason).toContain("cancelled");
	});
});
