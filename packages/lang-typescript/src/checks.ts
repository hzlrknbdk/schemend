import type { AdapterContext, CheckResult } from "@schemend/core";

function toCheckResult(
	name: string,
	exitCode: number,
	stdout: string,
	stderr: string,
): CheckResult {
	return {
		name,
		status: exitCode === 0 ? "passed" : "failed",
		detail: exitCode === 0 ? undefined : stderr || stdout,
	};
}

/** LanguageAdapter.build (SPEC §4): typechecks the consumer via its own "typecheck" script. */
export async function build(ctx: AdapterContext): Promise<CheckResult> {
	const result = await ctx.exec("pnpm run typecheck");
	return toCheckResult(
		"typecheck",
		result.exitCode,
		result.stdout,
		result.stderr,
	);
}

/** LanguageAdapter.test (SPEC §4): runs the consumer's own "test" script. */
export async function test(ctx: AdapterContext): Promise<CheckResult> {
	const result = await ctx.exec("pnpm test");
	return toCheckResult("test", result.exitCode, result.stdout, result.stderr);
}
