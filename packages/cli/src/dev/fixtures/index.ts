import type { CheckEvent } from "@schemend/core";
import { events as baselineFailure } from "./baseline-failure.js";
import { events as budgetOverrun } from "./budget-overrun.js";
import { events as selfCorrectingAgent } from "./self-correcting-agent.js";
import { events as successfulFix } from "./successful-fix.js";

/** The four scenarios docs/PLAN.md asks the interactive UI to be developed against. */
export const FIXTURES: Record<string, CheckEvent[]> = {
	"successful-fix": successfulFix,
	"self-correcting-agent": selfCorrectingAgent,
	"budget-overrun": budgetOverrun,
	"baseline-failure": baselineFailure,
};
