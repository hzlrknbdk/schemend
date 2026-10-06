import { access } from "node:fs/promises";
import path from "node:path";
import type { AdapterContext, CheckResult } from "@schemend/core";

const NEXT_CONFIG_FILES = [
	"next.config.ts",
	"next.config.js",
	"next.config.mjs",
];

/**
 * `.next/types` (route param types like LayoutProps) is a side effect of `next dev`/`build`;
 * a fresh checkout (a CI runner, a disposable worktree) has never run either, so a plain
 * `tsc --noEmit` fails on Next's own generated types before it ever reaches the schema change.
 * `next typegen` produces just that directory without a full build.
 */
async function isNextProject(root: string): Promise<boolean> {
	for (const file of NEXT_CONFIG_FILES) {
		try {
			await access(path.join(root, file));
			return true;
		} catch {
			// try the next candidate
		}
	}
	return false;
}

function toCheckResult(
	name: string,
	exitCode: number,
	stdout: string,
	stderr: string,
): CheckResult {
	return exitCode === 0
		? { name, status: "passed" }
		: { name, status: "failed", detail: stderr || stdout };
}

/** LanguageAdapter.build (SPEC §4): typechecks the consumer via its own "typecheck" script. */
export async function build(ctx: AdapterContext): Promise<CheckResult> {
	if (await isNextProject(ctx.root)) {
		await ctx.exec("pnpm exec next typegen");
	}
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
