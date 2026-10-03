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
		checks: z.array(z.string()).optional(),
		mustNotContain: z.array(z.string()).optional(),
		flagContains: z.string().optional(),
	})
	.refine(
		(consumer) =>
			consumer.expected !== "fixed" ||
			(consumer.checks?.length ?? 0) > 0 ||
			(consumer.mustNotContain?.length ?? 0) > 0,
		{ message: "fixed consumers require checks or mustNotContain" },
	)
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
	schemaBefore: z.string(),
	schemaAfter: z.string(),
	consumers: z.record(z.string(), ConsumerExpectationSchema),
});

export type ConsumerExpectation = z.infer<typeof ConsumerExpectationSchema>;
export type Scenario = z.infer<typeof ScenarioSchema>;

export function parseScenario(json: unknown): Scenario {
	return ScenarioSchema.parse(json);
}
