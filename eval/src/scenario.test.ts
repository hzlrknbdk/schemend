import { describe, expect, it } from "vitest";
import { parseScenario } from "./scenario.js";

const validScenario = {
	id: "field-to-object",
	description: "orders: totalPrice replaced by total { amount, currency }",
	real: false,
	source: "schemend-demo",
	ref: "a1b2c3d",
	schemaBefore: "schema.before.json",
	schemaAfter: "schema.after.json",
	consumers: {
		"apps/checkout-web": {
			expected: "fixed",
			checks: ["pnpm typecheck", "pnpm test"],
			mustNotContain: ["totalPrice"],
		},
		"services/notification": {
			expected: "flagged",
			flagContains: "currency",
		},
	},
};

describe("parseScenario", () => {
	it("accepts the spec example", () => {
		expect(() => parseScenario(validScenario)).not.toThrow();
	});

	it("accepts an untouched consumer with no extra fields", () => {
		expect(() =>
			parseScenario({
				...validScenario,
				consumers: { "services/invoice": { expected: "untouched" } },
			}),
		).not.toThrow();
	});

	it("rejects a fixed consumer without checks or mustNotContain", () => {
		expect(() =>
			parseScenario({
				...validScenario,
				consumers: { "apps/checkout-web": { expected: "fixed" } },
			}),
		).toThrow();
	});

	it("rejects a flagged consumer without flagContains", () => {
		expect(() =>
			parseScenario({
				...validScenario,
				consumers: { "services/notification": { expected: "flagged" } },
			}),
		).toThrow();
	});

	it("rejects a ref that is not a hex commit sha", () => {
		expect(() =>
			parseScenario({ ...validScenario, ref: "not-a-sha" }),
		).toThrow();
	});

	it("rejects a ref shorter than 7 characters", () => {
		expect(() => parseScenario({ ...validScenario, ref: "a1b2c3" })).toThrow();
	});

	it("rejects a scenario missing ref", () => {
		const { ref, ...withoutRef } = validScenario;
		expect(() => parseScenario(withoutRef)).toThrow();
	});
});
