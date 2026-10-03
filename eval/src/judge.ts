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

	switch (expectation.expected) {
		case "fixed": {
			if (!changed) return "missed";
			return remainingMatches.length > 0 ? "wrong-fix" : "correct-fix";
		}
		case "flagged": {
			const matched =
				expectation.flagContains !== undefined &&
				result.flags.some((flag) =>
					flag.reason.includes(expectation.flagContains as string),
				);
			if (matched) return "correct-flag";
			return changed ? "wrong-fix" : "missed";
		}
		case "untouched": {
			return changed || flagged ? "overreach" : "correct-untouched";
		}
	}
}
