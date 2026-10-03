import { describe, expect, it } from "vitest";
import { judge } from "./judge.js";
import type { ConsumerExpectation } from "./scenario.js";
import type { SolverResult } from "./solver.js";

const noResult: SolverResult = { changedFiles: [], flags: [] };

function fixed(
	overrides: Partial<ConsumerExpectation> = {},
): ConsumerExpectation {
	return { expected: "fixed", mustNotContain: ["totalPrice"], ...overrides };
}

function flagged(
	overrides: Partial<ConsumerExpectation> = {},
): ConsumerExpectation {
	return { expected: "flagged", flagContains: "currency", ...overrides };
}

function untouched(): ConsumerExpectation {
	return { expected: "untouched" };
}

describe("judge", () => {
	it("returns missed when a fixed consumer was not changed", () => {
		expect(
			judge({ expectation: fixed(), result: noResult, remainingMatches: [] }),
		).toBe("missed");
	});

	it("returns correct-fix when changed and nothing forbidden remains", () => {
		const result: SolverResult = { changedFiles: ["a.ts"], flags: [] };
		expect(judge({ expectation: fixed(), result, remainingMatches: [] })).toBe(
			"correct-fix",
		);
	});

	it("returns wrong-fix when changed but a forbidden string remains", () => {
		const result: SolverResult = { changedFiles: ["a.ts"], flags: [] };
		expect(
			judge({ expectation: fixed(), result, remainingMatches: ["totalPrice"] }),
		).toBe("wrong-fix");
	});

	it("returns correct-flag when a flag mentions flagContains", () => {
		const result: SolverResult = {
			changedFiles: [],
			flags: [{ file: "receipt.cs", reason: "hardcoded currency suffix" }],
		};
		expect(
			judge({ expectation: flagged(), result, remainingMatches: [] }),
		).toBe("correct-flag");
	});

	it("returns overreach when an untouched consumer was changed", () => {
		const result: SolverResult = { changedFiles: ["a.ts"], flags: [] };
		expect(
			judge({ expectation: untouched(), result, remainingMatches: [] }),
		).toBe("overreach");
	});

	it("returns correct-untouched when an untouched consumer stayed untouched", () => {
		expect(
			judge({
				expectation: untouched(),
				result: noResult,
				remainingMatches: [],
			}),
		).toBe("correct-untouched");
	});
});
