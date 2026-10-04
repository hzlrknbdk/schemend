import { query } from "@anthropic-ai/claude-agent-sdk";
import {
	buildAgentTools,
	qualifiedToolName,
	TOOL_NAMES,
	TOOL_SERVER_NAME,
} from "./agent-tools.js";
import { type Budget, BudgetExceededError } from "./budget.js";
import type { AdapterContext } from "./context.js";
import type { LanguageAdapter } from "./language-adapter.js";
import type {
	AffectedLocation,
	ApiChange,
	CheckResult,
	Confidence,
	ReviewItem,
} from "./types.js";

export interface FixAgentInput {
	ctx: AdapterContext;
	adapter: Pick<LanguageAdapter, "build" | "test">;
	affected: AffectedLocation[];
	changes: ApiChange[];
	budget: Budget;
	model: string;
}

export interface FixAgentOutput {
	changedFiles: string[];
	checks: CheckResult[];
	confidence: Confidence;
	costUsd: number;
	review: ReviewItem[];
}

function buildPrompt(
	changes: ApiChange[],
	affected: AffectedLocation[],
): string {
	const changeLines = changes
		.map((change) => `- [${change.id}] ${change.summary} (${change.target})`)
		.join("\n");
	const locationLines = affected
		.map(
			(location) =>
				`- ${location.file}:${location.line} (change ${location.changeId})\n    ${location.snippet}`,
		)
		.join("\n");

	return [
		"An internal API schema changed. Fix the affected code in this consumer project.",
		"",
		"API changes:",
		changeLines,
		"",
		"Affected locations:",
		locationLines,
		"",
		"Use read_file to inspect a file before editing it. Use edit_file to fix ONLY the files " +
			"listed above - do not touch any other file. After editing, call run_build and run_tests " +
			"to verify your fix; if they fail, keep fixing within the listed files until they pass or " +
			"you run out of ideas, then stop.",
	].join("\n");
}

function skip(
	checks: CheckResult[],
	reason: string,
	root: string,
): FixAgentOutput {
	return {
		changedFiles: [],
		checks,
		confidence: "unverified",
		costUsd: 0,
		review: [{ file: root, reason }],
	};
}

/**
 * Fix + Verify (SPEC §2 steps 5-6). Runs the baseline first (step 3); on failure, skips the agent
 * entirely and reports impact only. Otherwise runs a bash-free Claude Agent SDK loop restricted
 * to read_file/edit_file/run_build/run_tests (SPEC §6), bounded by the remaining budget via the
 * SDK's own `maxBudgetUsd`. "Retry within budget" (SPEC step 6) isn't separate code here: run_build
 * and run_tests are tools the agent itself calls, so it already iterates on failures on its own.
 * Confidence and the final checks come from our own build/test run after the loop ends, not the
 * agent's self-reported tool calls - a real check is still the actual proof a fix is complete.
 */
export async function runFixAgent(
	input: FixAgentInput,
): Promise<FixAgentOutput> {
	const { ctx, adapter, affected, changes, budget, model } = input;

	const baselineBuild = await adapter.build(ctx);
	const baselineTest = await adapter.test(ctx);
	if (baselineBuild.status !== "passed" || baselineTest.status !== "passed") {
		return skip(
			[baselineBuild, baselineTest],
			"baseline build/test failed before any fix was attempted",
			ctx.root,
		);
	}

	try {
		budget.assertAvailable();
	} catch (error) {
		if (error instanceof BudgetExceededError) {
			return skip(
				[baselineBuild, baselineTest],
				"budget exhausted before this service could be fixed",
				ctx.root,
			);
		}
		throw error;
	}

	const affectedFiles = [...new Set(affected.map((location) => location.file))];
	const { server, changedFiles } = buildAgentTools(ctx, adapter, affectedFiles);

	let costUsd = 0;
	let review: ReviewItem[] = [];

	const agentQuery = query({
		prompt: buildPrompt(changes, affected),
		options: {
			model,
			cwd: ctx.root,
			tools: TOOL_NAMES.map(qualifiedToolName),
			mcpServers: { [TOOL_SERVER_NAME]: server },
			strictMcpConfig: true,
			permissionMode: "bypassPermissions",
			maxBudgetUsd: budget.remaining,
			systemPrompt:
				"You are schemend's fix agent. You only have four tools: read_file, edit_file, " +
				"run_build, run_tests. You have no shell access and cannot read or edit any file " +
				"outside the ones you are told are affected.",
		},
	});

	for await (const message of agentQuery) {
		if (message.type === "result") {
			costUsd = message.total_cost_usd;
			if (message.subtype === "error_max_budget_usd") {
				review = [{ file: ctx.root, reason: "budget exceeded while fixing" }];
			}
		}
	}

	budget.record(costUsd);

	const finalBuild = await adapter.build(ctx);
	const finalTest = await adapter.test(ctx);
	const confidence: Confidence =
		finalTest.status === "passed"
			? "verified-by-tests"
			: finalBuild.status === "passed"
				? "verified-by-build"
				: "unverified";

	return {
		changedFiles: [...changedFiles],
		checks: [finalBuild, finalTest],
		confidence,
		costUsd,
		review,
	};
}
