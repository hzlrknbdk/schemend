import { describe, expect, it } from "vitest";
import { parseScenario } from "./scenario.js";

const validScenario = {
	id: "field-to-object",
	description: "orders: totalPrice replaced by total { amount, currency }",
	real: false,
	source: "schemend-demo",
	ref: "a1b2c3d",
	providerSchema: "services/orders/openapi.json",
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
			checks: ["pnpm test"],
		},
	},
};

describe("parseScenario", () => {
	it("accepts the spec example", () => {
		expect(() => parseScenario(validScenario)).not.toThrow();
	});

	it("accepts an untouched consumer with just checks", () => {
		expect(() =>
			parseScenario({
				...validScenario,
				consumers: {
					"services/invoice": {
						expected: "untouched",
						checks: ["mvn test"],
					},
				},
			}),
		).not.toThrow();
	});

	it("rejects a consumer without checks", () => {
		expect(() =>
			parseScenario({
				...validScenario,
				consumers: {
					"apps/checkout-web": {
						expected: "fixed",
						mustNotContain: ["totalPrice"],
					},
				},
			}),
		).toThrow();
	});

	it("rejects a consumer whose checks array is empty", () => {
		expect(() =>
			parseScenario({
				...validScenario,
				consumers: {
					"apps/checkout-web": {
						expected: "fixed",
						checks: [],
						mustNotContain: ["totalPrice"],
					},
				},
			}),
		).toThrow();
	});

	it("rejects a flagged consumer without flagContains", () => {
		expect(() =>
			parseScenario({
				...validScenario,
				consumers: {
					"services/notification": {
						expected: "flagged",
						checks: ["pnpm test"],
					},
				},
			}),
		).toThrow();
	});

	it("rejects a scenario missing providerSchema", () => {
		const { providerSchema, ...withoutProviderSchema } = validScenario;
		expect(() => parseScenario(withoutProviderSchema)).toThrow();
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

	it("accepts a fixed consumer with a setup array", () => {
		expect(() =>
			parseScenario({
				...validScenario,
				consumers: {
					"apps/checkout-web": {
						expected: "fixed",
						setup: ["pnpm install --frozen-lockfile", "pnpm generate:api"],
						checks: ["pnpm typecheck"],
						mustNotContain: ["totalPrice"],
					},
				},
			}),
		).not.toThrow();
	});
});
