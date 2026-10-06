import { copyFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { type CheckResult, runChecks } from "./checks.js";
import { runCommand } from "./exec.js";
import { discoverScenarios, type RunnerRow, runScenario } from "./runner.js";
import type { ConsumerExpectation, Scenario } from "./scenario.js";
import { noopSolver, type Solver } from "./solver.js";
import { createWorktree } from "./worktree.js";

const evalRoot = path.resolve(
	path.dirname(fileURLToPath(import.meta.url)),
	"..",
);
const scenariosDir = path.join(evalRoot, "scenarios");

function resolveSourceRoot(source: string): string {
	// Assumes the sibling-repo layout from CLAUDE.md: ~/Projects/<source>.
	return path.resolve(evalRoot, "..", "..", source);
}

async function runSetupCommand(command: string, cwd: string): Promise<void> {
	const result = await runCommand(command, cwd);
	if (result.exitCode !== 0) {
		throw new Error(
			`"${command}" failed in ${cwd}:\n${result.stderr || result.stdout}`,
		);
	}
}

async function runSetup(
	expectation: ConsumerExpectation,
	dir: string,
): Promise<void> {
	for (const command of expectation.setup ?? []) {
		await runSetupCommand(command, dir);
	}
}

interface ReadyConsumer {
	key: string;
	dir: string;
	expectation: ConsumerExpectation;
}

// worktree @ref -> per consumer baseline (setup + checks against the schema still on disk at
// ref; a failing baseline means the fixture itself is broken, not the solver, so that consumer
// is marked "invalid" and skipped) -> apply schemaAfter -> per ready consumer: re-run setup so
// generated types reflect the change -> solver -> mustNotContain -> checks -> judge -> cleanup.
export async function runScenarioInWorktree(
	scenario: Scenario,
	solver: Solver,
): Promise<RunnerRow[]> {
	const sourceRoot = resolveSourceRoot(scenario.source);
	const worktree = await createWorktree(sourceRoot, scenario.ref);
	try {
		const rows: RunnerRow[] = [];
		const ready: ReadyConsumer[] = [];

		for (const [key, expectation] of Object.entries(scenario.consumers)) {
			const dir = path.join(worktree.dir, key);
			await runSetup(expectation, dir);

			const baseline: CheckResult[] | undefined =
				expectation.checks && expectation.checks.length > 0
					? await runChecks(dir, expectation.checks)
					: undefined;
			const baselineFailed = baseline?.some(
				(check) => check.status === "failed",
			);
			if (baseline) {
				console.log(
					`[baseline] ${scenario.id}/${key}: ${baselineFailed ? "failed" : "passed"}`,
				);
			}
			if (baselineFailed) {
				rows.push({
					scenarioId: scenario.id,
					consumer: key,
					real: scenario.real,
					expected: expectation.expected,
					result: "invalid",
					...(baseline !== undefined ? { checks: baseline } : {}),
				});
				continue;
			}

			ready.push({ key, dir, expectation });
		}

		if (ready.length > 0) {
			await copyFile(
				path.join(scenariosDir, scenario.id, scenario.schemaAfter),
				path.join(worktree.dir, scenario.providerSchema),
			);

			const consumerDirs: Record<string, string> = {};
			for (const { key, dir, expectation } of ready) {
				await runSetup(expectation, dir);
				consumerDirs[key] = dir;
			}

			const readyScenario: Scenario = {
				...scenario,
				consumers: Object.fromEntries(
					ready.map(({ key, expectation }) => [key, expectation]),
				),
			};
			rows.push(...(await runScenario(readyScenario, consumerDirs, solver)));
		}

		return rows;
	} finally {
		await worktree.cleanup();
	}
}

const CORRECT_VERDICTS = new Set([
	"correct-fix",
	"correct-flag",
	"correct-untouched",
]);

function detailPreview(detail: string | undefined, maxLines = 3): string {
	if (!detail) return "";
	return detail
		.split("\n")
		.map((line) => line.trim())
		.filter(Boolean)
		.slice(0, maxLines)
		.join(" | ");
}

function formatChecks(checks: RunnerRow["checks"]): string {
	if (!checks || checks.length === 0) return "-";
	const failed = checks.filter((check) => check.status === "failed");
	if (failed.length === 0) return "passed";
	return failed
		.map((check) => `${check.name}: ${detailPreview(check.detail)}`)
		.join(" / ");
}

function formatDetail(row: RunnerRow): string {
	if (row.result === "error") return row.error ?? "error";
	return formatChecks(row.checks);
}

function printReport(rows: RunnerRow[]): void {
	if (rows.length === 0) {
		console.log("No scenarios found in eval/scenarios.");
		return;
	}

	console.table(
		rows.map((row) => ({
			scenario: row.scenarioId,
			consumer: row.consumer,
			kind: row.real ? "real" : "simulated",
			expected: row.expected,
			result: row.result,
			checks: formatDetail(row),
		})),
	);

	const totals = {
		real: { total: 0, correct: 0 },
		simulated: { total: 0, correct: 0 },
	};
	let invalid = 0;
	let errored = 0;
	for (const row of rows) {
		if (row.result === "invalid") {
			invalid += 1;
			continue;
		}
		if (row.result === "error") {
			errored += 1;
			continue;
		}
		const bucket = row.real ? totals.real : totals.simulated;
		bucket.total += 1;
		if (CORRECT_VERDICTS.has(row.result)) bucket.correct += 1;
	}
	console.log(`Real:      ${totals.real.correct}/${totals.real.total} correct`);
	console.log(
		`Simulated: ${totals.simulated.correct}/${totals.simulated.total} correct`,
	);
	if (invalid > 0) {
		console.log(`Invalid (baseline failed, not counted above): ${invalid}`);
	}
	if (errored > 0) {
		console.log(`Errored (scenario crashed, not counted above): ${errored}`);
	}
}

function firstLine(error: unknown): string {
	const message = error instanceof Error ? error.message : String(error);
	return message.split("\n")[0] ?? message;
}

async function main(): Promise<void> {
	const scenarios = await discoverScenarios(scenariosDir);

	// Stale worktree metadata from a previous crashed run would otherwise make
	// `git worktree add` fail with "already exists" the next time around.
	const sourceRoots = new Set(
		scenarios.map((s) => resolveSourceRoot(s.source)),
	);
	for (const sourceRoot of sourceRoots) {
		await runCommand("git worktree prune", sourceRoot);
	}

	const rows: RunnerRow[] = [];
	for (const scenario of scenarios) {
		try {
			rows.push(...(await runScenarioInWorktree(scenario, noopSolver)));
		} catch (error) {
			rows.push({
				scenarioId: scenario.id,
				consumer: "-",
				real: scenario.real,
				expected: "-",
				result: "error",
				error: firstLine(error),
			});
		}
	}
	printReport(rows);
}

const isMainModule = process.argv[1] === fileURLToPath(import.meta.url);
if (isMainModule) {
	main().catch((error: unknown) => {
		console.error(error);
		process.exitCode = 1;
	});
}
