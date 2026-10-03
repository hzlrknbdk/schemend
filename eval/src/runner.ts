import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { judge, type Verdict } from "./judge.js";
import { parseScenario, type Scenario } from "./scenario.js";
import { noopSolver, type Solver } from "./solver.js";

export interface RunnerRow {
	scenarioId: string;
	consumer: string;
	real: boolean;
	expected: string;
	result: Verdict;
}

export async function discoverScenarios(
	scenariosDir: string,
): Promise<Scenario[]> {
	const entries = await readdir(scenariosDir, { withFileTypes: true }).catch(
		(error: unknown) => {
			if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
			throw error;
		},
	);
	const scenarios: Scenario[] = [];
	for (const entry of entries) {
		if (!entry.isDirectory()) continue;
		const scenarioPath = path.join(scenariosDir, entry.name, "scenario.json");
		const raw = JSON.parse(await readFile(scenarioPath, "utf8"));
		const scenario = parseScenario(raw);
		if (scenario.id !== entry.name) {
			throw new Error(
				`scenario id "${scenario.id}" does not match its folder name "${entry.name}"`,
			);
		}
		scenarios.push(scenario);
	}
	return scenarios;
}

const SKIP_DIRS = new Set(["node_modules", ".next"]);
const SKIP_FILES = new Set(["orders-api.d.ts"]);

async function collectScannableFiles(dir: string): Promise<string[]> {
	const entries = await readdir(dir, { withFileTypes: true });
	const files: string[] = [];
	for (const entry of entries) {
		if (entry.isDirectory()) {
			if (SKIP_DIRS.has(entry.name)) continue;
			files.push(...(await collectScannableFiles(path.join(dir, entry.name))));
			continue;
		}
		if (entry.isFile() && !SKIP_FILES.has(entry.name)) {
			files.push(path.join(dir, entry.name));
		}
	}
	return files;
}

function escapeRegExp(value: string): string {
	return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Word boundary on the right only: `.totalPrice` must not match `.totalPriceWithTax`.
// No attempt to exclude comments or string literals; that's checks' job, not this heuristic's.
function containsFieldAccess(content: string, needle: string): boolean {
	return new RegExp(`${escapeRegExp(needle)}(?![\\w$])`).test(content);
}

async function findRemainingMatches(
	dir: string,
	mustNotContain: string[],
): Promise<string[]> {
	if (mustNotContain.length === 0) return [];
	const found = new Set<string>();
	const files = await collectScannableFiles(dir);
	for (const filePath of files) {
		const content = await readFile(filePath, "utf8").catch(() => "");
		for (const needle of mustNotContain) {
			if (containsFieldAccess(content, needle)) found.add(needle);
		}
	}
	return [...found];
}

export async function runScenario(
	scenario: Scenario,
	consumerDirs: Record<string, string>,
	solver: Solver = noopSolver,
): Promise<RunnerRow[]> {
	const rows: RunnerRow[] = [];
	for (const [consumerKey, expectation] of Object.entries(scenario.consumers)) {
		const dir = consumerDirs[consumerKey];
		if (!dir) {
			throw new Error(`no directory given for consumer "${consumerKey}"`);
		}
		const result = await solver(scenario, dir);
		const remainingMatches = await findRemainingMatches(
			dir,
			expectation.mustNotContain ?? [],
		);
		rows.push({
			scenarioId: scenario.id,
			consumer: consumerKey,
			real: scenario.real,
			expected: expectation.expected,
			result: judge({ expectation, result, remainingMatches }),
		});
	}
	return rows;
}
