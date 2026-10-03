import type { ConsumerExpectation } from "./scenario.js";
import type { SolverResult } from "./solver.js";

export type Verdict =
	| "correct-fix"
	| "correct-flag"
	| "correct-untouched"
	| "wrong-fix"
	| "missed"
	| "overreach";

export interface JudgeInput {
	expectation: ConsumerExpectation;
	result: SolverResult;
	/** mustNotContain strings from the expectation that are still found on disk after the solver ran. */
	remainingMatches: string[];
}

export function judge({
	expectation,
	result,
	remainingMatches,
}: JudgeInput): Verdict {
	const changed = result.changedFiles.length > 0;
	const flagged = result.flags.length > 0;
	const matchedFlag =
		expectation.flagContains !== undefined &&
		result.flags.some((flag) =>
			flag.reason.includes(expectation.flagContains as string),
		);

	switch (expectation.expected) {
		case "fixed": {
			if (!changed) return "missed";
			if (remainingMatches.length > 0) return "wrong-fix";
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
