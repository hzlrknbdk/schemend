import type { CheckResult } from "./checks.js";
import type { ConsumerExpectation } from "./scenario.js";
import type { SolverResult } from "./solver.js";

export type Verdict =
	| "correct-fix"
	| "correct-flag"
	| "correct-untouched"
	| "wrong-fix"
	| "missed"
	| "overreach"
	// Baseline checks failed before the schema change was even applied: the fixture itself is
	// broken, not the solver. Set directly by the CLI; judge() never returns it.
	| "invalid"
	// The scenario itself crashed (worktree, setup, a thrown solver, ...), not a verdict about
	// any particular consumer. Set directly by the CLI; judge() never returns it.
	| "error";

export interface JudgeInput {
	expectation: ConsumerExpectation;
	result: SolverResult;
	/** mustNotContain strings from the expectation that are still found on disk after the solver ran. */
	remainingMatches: string[];
	/** checks results, if the expectation configured any. Only affects the "fixed" verdict. */
	checks?: CheckResult[];
}

export function judge({
	expectation,
	result,
	remainingMatches,
	checks,
}: JudgeInput): Verdict {
	const changed = result.changedFiles.length > 0;
	const flagged = result.flags.length > 0;
	const { flagContains } = expectation;
	const matchedFlag =
		flagContains !== undefined &&
		result.flags.some((flag) => flag.reason.includes(flagContains));

	switch (expectation.expected) {
		case "fixed": {
			if (!changed) return "missed";
			if (remainingMatches.length > 0) return "wrong-fix";
			// checks (tsc, mvn, dotnet) catch what the mustNotContain heuristic misses.
			if (checks?.some((check) => check.status === "failed"))
				return "wrong-fix";
			// flagContains on a "fixed" consumer means: fix it AND flag it (e.g. currency semantics).
			// A clean fix with no matching flag silently passed over that second half.
			if (expectation.flagContains !== undefined && !matchedFlag) {
				return "wrong-fix";
			}
			return "correct-fix";
		}
		case "flagged": {
			// "flagged" means hands off the code, no matter how confident the guess is.
			if (changed) return "wrong-fix";
			return matchedFlag ? "correct-flag" : "missed";
		}
		case "untouched": {
			return changed || flagged ? "overreach" : "correct-untouched";
		}
	}
}
