import path from "node:path";
import { fileURLToPath } from "node:url";
import { discoverScenarios, type RunnerRow, runScenario } from "./runner.js";
import { noopSolver } from "./solver.js";

const evalRoot = path.resolve(
	path.dirname(fileURLToPath(import.meta.url)),
	"..",
);
const scenariosDir = path.join(evalRoot, "scenarios");

function resolveConsumerDir(source: string, consumerKey: string): string {
	// Assumes the sibling-repo layout from CLAUDE.md: ~/Projects/<source>/<consumerKey>.
	return path.resolve(evalRoot, "..", "..", source, consumerKey);
}

const CORRECT_VERDICTS = new Set([
	"correct-fix",
	"correct-flag",
	"correct-untouched",
]);

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
		})),
	);

	const totals = {
		real: { total: 0, correct: 0 },
		simulated: { total: 0, correct: 0 },
	};
	for (const row of rows) {
		const bucket = row.real ? totals.real : totals.simulated;
		bucket.total += 1;
		if (CORRECT_VERDICTS.has(row.result)) bucket.correct += 1;
	}
	console.log(`Real:      ${totals.real.correct}/${totals.real.total} correct`);
	console.log(
		`Simulated: ${totals.simulated.correct}/${totals.simulated.total} correct`,
	);
}

async function main(): Promise<void> {
	const scenarios = await discoverScenarios(scenariosDir);
	const rows: RunnerRow[] = [];
	for (const scenario of scenarios) {
		const consumerDirs = Object.fromEntries(
			Object.keys(scenario.consumers).map((key) => [
				key,
				resolveConsumerDir(scenario.source, key),
			]),
		);
		rows.push(...(await runScenario(scenario, consumerDirs, noopSolver)));
	}
	printReport(rows);
}

main().catch((error: unknown) => {
	console.error(error);
	process.exitCode = 1;
});
