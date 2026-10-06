import { rm } from "node:fs/promises";
import path from "node:path";
import { runFixAgent } from "./agent.js";
import { Budget, BudgetExceededError } from "./budget.js";
import type { Config } from "./config.js";
import type { AdapterContext, Exec } from "./context.js";
import { writeFileAtRef } from "./git.js";
import type { LanguageAdapter } from "./language-adapter.js";
import { diffSchemas } from "./oasdiff.js";
import type {
	ApiChange,
	ApiEntry,
	CheckResult,
	Confidence,
	ReviewItem,
	RunReport,
	ServiceResult,
} from "./types.js";

export interface RunCheckOptions {
	config: Config;
	/** The consumer project's own root; one schemend.config.ts is one consumer (SPEC §5). */
	root: string;
	exec: Exec;
	/** Tried in order; the first one whose detect(root) returns true is used for every api. */
	adapters: LanguageAdapter[];
	/** git ref the "old" schema is read from (SPEC §2 step 2). Defaults to the previous commit. */
	baseRef?: string;
	/** Called once per step so the CLI can print progress (SPEC §9); core itself does no I/O. */
	onStep?: (message: string) => void;
}

const BRANCH_NAME = "schemend/update";

async function pickAdapter(
	adapters: LanguageAdapter[],
	root: string,
): Promise<LanguageAdapter | undefined> {
	for (const adapter of adapters) {
		if (await adapter.detect(root)) return adapter;
	}
	return undefined;
}

function toApiEntry(apiConfig: Config["apis"][number]): ApiEntry {
	return {
		name: apiConfig.name,
		kind: "internal",
		source: { type: "openapi", location: apiConfig.schema },
		usedIn: apiConfig.usedIn,
	};
}

function confidenceFrom(build: CheckResult, test: CheckResult): Confidence {
	if (test.status === "passed") return "verified-by-tests";
	if (build.status === "passed") return "verified-by-build";
	return "unverified";
}

async function ensureBranch(ctx: AdapterContext): Promise<void> {
	const created = await ctx.exec(`git checkout -b ${BRANCH_NAME}`);
	if (created.exitCode !== 0) {
		await ctx.exec(`git checkout ${BRANCH_NAME}`);
	}
}

/**
 * Stages everything under ctx.root and commits it if there's anything to commit. `--relative`
 * keeps the reported paths relative to ctx.root even when it's a subdirectory of the repo, same
 * as every other path this package produces (findAffected, discoverApis, ...).
 */
async function commitAll(
	ctx: AdapterContext,
	message: string,
): Promise<string[]> {
	await ctx.exec("git add -A .");
	const staged = await ctx.exec("git diff --name-only --cached --relative");
	const changedFiles = staged.stdout
		.split("\n")
		.map((line) => line.trim())
		.filter(Boolean);
	if (changedFiles.length === 0) return [];

	const commit = await ctx.exec(`git commit -q -m "${message}"`);
	return commit.exitCode === 0 ? changedFiles : [];
}

/**
 * `schemend check` (SPEC §9): the local, no-push half of the SPEC §2 flow (steps 2-7) for one
 * consumer. Shares one Budget across every api in config.apis (SPEC §6: stop once it's gone,
 * report the rest). All fixes for this run land as commits on one local branch, matching "one PR
 * per consumer service" (SPEC §2 step 7) - `schemend run` pushes it and opens that PR.
 */
export async function runCheck(options: RunCheckOptions): Promise<RunReport> {
	const { config, root, exec, adapters } = options;
	const baseRef = options.baseRef ?? "HEAD~1";
	const ctx: AdapterContext = { root, exec };
	const budget = new Budget(config.budgetUsd);
	const service = path.basename(path.resolve(root));
	const step = (message: string) => options.onStep?.(message);

	const adapter = await pickAdapter(adapters, root);
	if (!adapter) {
		throw new Error(`no language adapter recognized the project at ${root}`);
	}

	const startedAt = new Date().toISOString();
	const allChanges: ApiChange[] = [];
	const services: ServiceResult[] = [];
	let branchReady = false;
	let stoppedReason: string | undefined;

	for (const apiConfig of config.apis) {
		step(`${apiConfig.name}: detecting schema changes`);
		let oldSchemaFile: string;
		try {
			oldSchemaFile = await writeFileAtRef(baseRef, apiConfig.schema, exec);
		} catch (error) {
			services.push({
				service,
				language: adapter.id,
				branch: "",
				steps: ["detect"],
				changedFiles: [],
				checks: [],
				review: [
					{
						file: apiConfig.schema,
						reason: `could not read the previous schema: ${error instanceof Error ? error.message : String(error)}`,
					},
				],
				confidence: "unverified",
				costUsd: 0,
			});
			continue;
		}

		const newSchemaFile = path.resolve(root, apiConfig.schema);
		let changes: ApiChange[];
		try {
			changes = await diffSchemas(oldSchemaFile, newSchemaFile, exec);
		} finally {
			await rm(path.dirname(oldSchemaFile), { recursive: true, force: true });
		}
		if (changes.length === 0) {
			step(`${apiConfig.name}: no changes found`);
			continue;
		}
		allChanges.push(...changes);
		step(
			`${apiConfig.name}: ${changes.length} change(s) found, running baseline`,
		);

		const api = toApiEntry(apiConfig);

		// SPEC §2 step 3: baseline BEFORE anything (including regeneration) changes.
		const baselineBuild = await adapter.build(ctx);
		const baselineTest = await adapter.test(ctx);
		if (baselineBuild.status !== "passed" || baselineTest.status !== "passed") {
			step(`${apiConfig.name}: baseline failed, skipping the fix`);
			services.push({
				service,
				language: adapter.id,
				branch: "",
				steps: ["detect", "baseline"],
				changedFiles: [],
				checks: [baselineBuild, baselineTest],
				review: [
					{
						file: root,
						reason: "baseline build/test failed before any fix was attempted",
					},
				],
				confidence: "unverified",
				costUsd: 0,
			});
			continue;
		}

		if (!branchReady) {
			await ensureBranch(ctx);
			branchReady = true;
		}

		// SPEC §2 step 4: regenerate the client, then locate the affected code.
		step(`${apiConfig.name}: regenerating the client`);
		if (adapter.regenerateClient) {
			await adapter.regenerateClient(ctx, api);
		}
		step(`${apiConfig.name}: locating affected code`);
		const affected = await adapter.findAffected(ctx, api, changes);

		if (affected.length === 0) {
			step(
				`${apiConfig.name}: nothing affected, verifying the regenerated client`,
			);
			const postBuild = await adapter.build(ctx);
			const postTest = await adapter.test(ctx);
			const ok = postBuild.status === "passed" && postTest.status === "passed";
			const review: ReviewItem[] = ok
				? []
				: [
						{
							file: root,
							reason:
								"no affected locations were found, but build/tests failed after " +
								"regenerating the client",
						},
					];
			const changedFiles = await commitAll(
				ctx,
				`schemend: update for ${apiConfig.name} change`,
			);
			services.push({
				service,
				language: adapter.id,
				branch: changedFiles.length > 0 ? BRANCH_NAME : "",
				steps: ["detect", "baseline", "regenerate", "impact"],
				changedFiles,
				checks: [postBuild, postTest],
				review,
				confidence: confidenceFrom(postBuild, postTest),
				costUsd: 0,
			});
			continue;
		}

		try {
			budget.assertAvailable();
		} catch (error) {
			if (!(error instanceof BudgetExceededError)) throw error;
			step(`${apiConfig.name}: budget exhausted, stopping`);
			const changedFiles = await commitAll(
				ctx,
				`schemend: update for ${apiConfig.name} change`,
			);
			services.push({
				service,
				language: adapter.id,
				branch: changedFiles.length > 0 ? BRANCH_NAME : "",
				steps: ["detect", "baseline", "regenerate", "impact"],
				changedFiles,
				checks: [],
				review: [
					{
						file: root,
						reason: "budget exhausted before this api could be fixed",
					},
				],
				confidence: "unverified",
				costUsd: 0,
			});
			stoppedReason = "budget exceeded";
			break;
		}

		// SPEC §2 steps 5-6: fix, then verify.
		step(
			`${apiConfig.name}: ${affected.length} location(s) affected, running the fix agent`,
		);
		const fix = await runFixAgent({
			ctx,
			adapter,
			affected,
			changes,
			budget,
			model: config.models.fix,
		});
		const changedFiles = await commitAll(
			ctx,
			`schemend: update for ${apiConfig.name} change`,
		);
		step(
			`${apiConfig.name}: done (${fix.confidence}, $${fix.costUsd.toFixed(2)})`,
		);

		services.push({
			service,
			language: adapter.id,
			branch: changedFiles.length > 0 ? BRANCH_NAME : "",
			steps: ["detect", "baseline", "regenerate", "impact", "fix", "verify"],
			changedFiles,
			checks: fix.checks,
			review: fix.review,
			confidence: fix.confidence,
			costUsd: fix.costUsd,
		});

		if (fix.review.some((item) => item.reason.includes("budget"))) {
			stoppedReason = "budget exceeded";
			break;
		}
	}

	return {
		api: config.apis.map((apiConfig) => apiConfig.name).join(", "),
		startedAt,
		finishedAt: new Date().toISOString(),
		changes: allChanges,
		services,
		budgetUsd: config.budgetUsd,
		spentUsd: budget.spent,
		...(stoppedReason !== undefined ? { stoppedReason } : {}),
	};
}
