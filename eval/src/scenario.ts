import { z } from "zod";

const RefSchema = z
	.string()
	.regex(
		/^[0-9a-f]{7,}$/i,
		"ref must be a hex commit sha of at least 7 characters",
	);

const ConsumerExpectationSchema = z
	.object({
		expected: z.enum(["fixed", "flagged", "untouched"]),
		setup: z.array(z.string()).optional(),
		// Required for every consumer: it's also the baseline gate (run once before schemaAfter
		// is applied), so a consumer with no checks would never get that safety net.
		checks: z
			.array(z.string())
			.min(1, "checks is required (used as the baseline gate)"),
		mustNotContain: z.array(z.string()).optional(),
		flagContains: z.string().optional(),
	})
	.refine(
		(consumer) => consumer.expected !== "flagged" || !!consumer.flagContains,
		{
			message: "flagged consumers require flagContains",
		},
	);

export const ScenarioSchema = z.object({
	id: z.string(),
	description: z.string(),
	real: z.boolean(),
	source: z.string(),
	ref: RefSchema,
	// Path (relative to the source repo root) that schemaAfter gets copied onto before checks run.
	providerSchema: z.string(),
	schemaBefore: z.string(),
	schemaAfter: z.string(),
	consumers: z.record(z.string(), ConsumerExpectationSchema),
});

export type ConsumerExpectation = z.infer<typeof ConsumerExpectationSchema>;
export type Scenario = z.infer<typeof ScenarioSchema>;

export function parseScenario(json: unknown): Scenario {
	return ScenarioSchema.parse(json);
}
