import { describe, expect, it } from "vitest";
import { Budget, BudgetExceededError } from "./budget.js";

describe("Budget", () => {
	it("starts with the full limit available", () => {
		const budget = new Budget(1);
		expect(budget.spent).toBe(0);
		expect(budget.remaining).toBe(1);
		expect(budget.limitUsd).toBe(1);
	});

	it("tracks spend across multiple records", () => {
		const budget = new Budget(1);
		budget.record(0.3);
		budget.record(0.4);
		expect(budget.spent).toBeCloseTo(0.7);
		expect(budget.remaining).toBeCloseTo(0.3);
	});

	it("clamps remaining at 0 once spend exceeds the limit", () => {
		const budget = new Budget(1);
		budget.record(1.5);
		expect(budget.remaining).toBe(0);
	});

	it("records the real cost even past the limit, without throwing", () => {
		const budget = new Budget(1);
		budget.record(1.5);
		expect(budget.spent).toBeCloseTo(1.5);
	});

	it("rejects a negative cost", () => {
		const budget = new Budget(1);
		expect(() => budget.record(-0.1)).toThrow();
	});

	it("assertAvailable passes while under the limit", () => {
		const budget = new Budget(1);
		budget.record(0.5);
		expect(() => budget.assertAvailable()).not.toThrow();
	});

	it("assertAvailable throws once spend reaches the limit", () => {
		const budget = new Budget(1);
		budget.record(1);
		expect(() => budget.assertAvailable()).toThrow(BudgetExceededError);
	});

	it("assertAvailable throws once spend exceeds the limit", () => {
		const budget = new Budget(1);
		budget.record(1.5);
		expect(() => budget.assertAvailable()).toThrow(BudgetExceededError);
	});
});
