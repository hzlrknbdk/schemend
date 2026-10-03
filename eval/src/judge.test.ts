import { describe, expect, it } from "vitest";
import type { CheckResult } from "./checks.js";
import { judge } from "./judge.js";
import type { ConsumerExpectation } from "./scenario.js";
import type { SolverResult } from "./solver.js";

const noResult: SolverResult = { changedFiles: [], flags: [] };

// judge() never reads expectation.checks (the command list); it only reads JudgeInput.checks
// (the already-computed results, passed separately below). Any non-empty array satisfies the type.
const SOME_CHECKS = ["pnpm typecheck"];

function fixed(
	overrides: Partial<ConsumerExpectation> = {},
): ConsumerExpectation {
	return {
		expected: "fixed",
		checks: SOME_CHECKS,
		mustNotContain: ["totalPrice"],
		...overrides,
	};
}

function flagged(
	overrides: Partial<ConsumerExpectation> = {},
): ConsumerExpectation {
	return {
		expected: "flagged",
		checks: SOME_CHECKS,
		flagContains: "currency",
		...overrides,
	};
}

function untouched(): ConsumerExpectation {
	return { expected: "untouched", checks: SOME_CHECKS };
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

	it("returns overreach when an untouched consumer was only flagged", () => {
		const result: SolverResult = {
			changedFiles: [],
			flags: [{ file: "a.ts", reason: "looks suspicious" }],
		};
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

	it("returns wrong-fix when a flagged consumer was changed, even with a matching flag", () => {
		const result: SolverResult = {
			changedFiles: ["a.ts"],
			flags: [{ file: "a.ts", reason: "hardcoded currency suffix" }],
		};
		expect(
			judge({ expectation: flagged(), result, remainingMatches: [] }),
		).toBe("wrong-fix");
	});

	it("returns missed when a flagged consumer was not changed and has no matching flag", () => {
		expect(
			judge({ expectation: flagged(), result: noResult, remainingMatches: [] }),
		).toBe("missed");
	});

	it("returns wrong-fix when a flagged consumer was changed with no matching flag", () => {
		const result: SolverResult = { changedFiles: ["a.ts"], flags: [] };
		expect(
			judge({ expectation: flagged(), result, remainingMatches: [] }),
		).toBe("wrong-fix");
	});

	it("returns correct-fix when a fixed+flagContains consumer was fixed and flagged", () => {
		const result: SolverResult = {
			changedFiles: ["a.ts"],
			flags: [{ file: "a.ts", reason: "hardcoded currency suffix" }],
		};
		expect(
			judge({
				expectation: fixed({ flagContains: "currency" }),
				result,
				remainingMatches: [],
			}),
		).toBe("correct-fix");
	});

	it("returns wrong-fix when a fixed+flagContains consumer was fixed but not flagged", () => {
		const result: SolverResult = { changedFiles: ["a.ts"], flags: [] };
		expect(
			judge({
				expectation: fixed({ flagContains: "currency" }),
				result,
				remainingMatches: [],
			}),
		).toBe("wrong-fix");
	});

	it("returns correct-fix when a fixed consumer's checks all pass", () => {
		const result: SolverResult = { changedFiles: ["a.ts"], flags: [] };
		const checks: CheckResult[] = [
			{ name: "pnpm typecheck", status: "passed" },
		];
		expect(
			judge({ expectation: fixed(), result, remainingMatches: [], checks }),
		).toBe("correct-fix");
	});

	it("returns wrong-fix when a fixed consumer has no remaining matches but a check fails", () => {
		const result: SolverResult = { changedFiles: ["a.ts"], flags: [] };
		const checks: CheckResult[] = [
			{ name: "pnpm typecheck", status: "failed", detail: "boom" },
		];
		expect(
			judge({ expectation: fixed(), result, remainingMatches: [], checks }),
		).toBe("wrong-fix");
	});

	it("ignores checks for a flagged consumer (informational only)", () => {
		const result: SolverResult = {
			changedFiles: [],
			flags: [{ file: "a.ts", reason: "hardcoded currency suffix" }],
		};
		const checks: CheckResult[] = [
			{ name: "pnpm typecheck", status: "failed", detail: "boom" },
		];
		expect(
			judge({ expectation: flagged(), result, remainingMatches: [], checks }),
		).toBe("correct-flag");
	});

	it("ignores checks for an untouched consumer (informational only)", () => {
		const checks: CheckResult[] = [
			{ name: "pnpm typecheck", status: "failed", detail: "boom" },
		];
		expect(
			judge({
				expectation: untouched(),
				result: noResult,
				remainingMatches: [],
				checks,
			}),
		).toBe("correct-untouched");
	});
});
