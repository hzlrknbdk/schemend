import type { Scenario } from "./scenario.js";

export interface SolverFlag {
	file: string;
	reason: string;
}

export interface SolverResult {
	changedFiles: string[];
	flags: SolverFlag[];
}

export type Solver = (
	scenario: Scenario,
	consumerPath: string,
) => Promise<SolverResult>;

export const noopSolver: Solver = async () => ({ changedFiles: [], flags: [] });
