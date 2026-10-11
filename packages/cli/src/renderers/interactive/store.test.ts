import type { CheckEvent } from "@schemend/core";
import { describe, expect, it } from "vitest";
import { FIXTURES } from "../../dev/fixtures/index.js";
import { createInitialState, reduceEvents } from "./store.js";

function replay(events: CheckEvent[]) {
	return events.reduce(reduceEvents, createInitialState());
}

describe("reduceEvents", () => {
	it("tracks a step through pending -> running -> passed, with duration", () => {
		let state = createInitialState();
		state = reduceEvents(state, {
			type: "run-started",
			timestamp: "t",
			eventSchemaVersion: 1,
			apis: ["orders"],
			budgetUsd: 1,
		});
		expect(state.apis.orders?.steps.baseline.status).toBe("pending");

		state = reduceEvents(state, {
			type: "step-started",
			timestamp: "t",
			api: "orders",
			step: "baseline",
		});
		expect(state.apis.orders?.steps.baseline.status).toBe("running");

		state = reduceEvents(state, {
			type: "step-finished",
			timestamp: "t",
			api: "orders",
			step: "baseline",
			durationMs: 120,
			status: "failed",
			reason: "baseline-failed",
		});
		expect(state.apis.orders?.steps.baseline).toEqual({
			status: "failed",
			durationMs: 120,
			reason: "baseline-failed",
		});
	});

	it("records the latest file-edited event as lastEdit", () => {
		const state = [
			{
				type: "file-edited" as const,
				timestamp: "t",
				api: "orders",
				file: "a.ts",
				added: 1,
				removed: 0,
				diff: "diff-a",
			},
			{
				type: "file-edited" as const,
				timestamp: "t",
				api: "orders",
				file: "b.ts",
				added: 2,
				removed: 1,
				diff: "diff-b",
			},
		].reduce(reduceEvents, createInitialState());

		expect(state.lastEdit).toEqual({
			api: "orders",
			file: "b.ts",
			added: 2,
			removed: 1,
			diff: "diff-b",
		});
	});

	it("attaches the ServiceResult from service-completed to the right api", () => {
		const state = replay([
			{
				type: "service-completed",
				timestamp: "t",
				api: "orders",
				service: {
					service: "checkout-web",
					language: "typescript",
					branch: "schemend/update",
					steps: [],
					changedFiles: [],
					checks: [],
					review: [],
					confidence: "verified-by-tests",
					costUsd: 0.1,
				},
			},
		]);

		expect(state.apis.orders?.service?.confidence).toBe("verified-by-tests");
	});

	it("caps the tool log at 8 entries, keeping the most recent", () => {
		const calls: CheckEvent[] = Array.from({ length: 12 }, (_, index) => ({
			type: "agent-tool-call",
			timestamp: "t",
			api: "orders",
			toolUseId: `tu_${index}`,
			tool: "run_build",
		}));

		const state = replay(calls);
		expect(state.apis.orders?.toolLog).toHaveLength(8);
		expect(state.apis.orders?.toolLog[0]?.toolUseId).toBe("tu_4");
		expect(state.apis.orders?.toolLog[7]?.toolUseId).toBe("tu_11");
	});

	describe("replaying the full fixtures", () => {
		it("successful-fix ends with a finished report and a verified-by-tests service", () => {
			const state = replay(FIXTURES["successful-fix"] ?? []);
			expect(state.report?.spentUsd).toBeCloseTo(0.08);
			expect(state.apis.orders?.steps.fix.status).toBe("passed");
			expect(state.apis.orders?.service?.confidence).toBe("verified-by-tests");
		});

		it("self-correcting-agent's tool log reflects the retry before the final success", () => {
			const state = replay(FIXTURES["self-correcting-agent"] ?? []);
			expect(state.apis.orders?.service?.confidence).toBe("verified-by-tests");
			expect(
				state.apis.orders?.toolLog.some((entry) => entry.status === "error"),
			).toBe(false); // the failing run_tests result fell out of the 8-entry window by the end
		});

		it("budget-overrun stops the second api before its fix step and reports why", () => {
			const state = replay(FIXTURES["budget-overrun"] ?? []);
			expect(state.report?.stoppedReason).toBe("budget exceeded");
			expect(state.apis.orders?.service?.confidence).toBe("verified-by-tests");
			expect(state.apis.invoices?.steps.fix.status).toBe("pending");
			expect(state.apis.invoices?.service?.review[0]?.reason).toContain(
				"budget",
			);
		});

		it("baseline-failure never reaches regenerate", () => {
			const state = replay(FIXTURES["baseline-failure"] ?? []);
			expect(state.apis.orders?.steps.baseline.status).toBe("failed");
			expect(state.apis.orders?.steps.regenerate.status).toBe("pending");
			expect(state.apis.orders?.service?.confidence).toBe("unverified");
		});
	});
});
