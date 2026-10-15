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
    } catch {}
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

export async function test(ctx: AdapterContext): Promise<CheckResult> {
  const result = await ctx.exec("pnpm test");
  return toCheckResult("test", result.exitCode, result.stdout, result.stderr);
}

/** tsc's error lines look like "foo.ts(1,2): error TS2345: ...". Returns {} for anything else. */
export function summarizeBuildFailure(result: CheckResult): {
  errorCount?: number;
  firstError?: string;
} {
  const matches = result.detail?.match(/error TS\d+[^\n]*/g);
  if (!matches || matches.length === 0) return {};
  return { errorCount: matches.length, firstError: matches[0]?.trim() };
}

/**
 * Matches vitest's default reporter summary line ("Tests  1 failed | 9 passed (10)") and its
 * first failing-test marker line. Returns whichever parts it recognizes.
 */
export function summarizeTestResult(result: CheckResult): {
  passed?: number;
  failed?: number;
  firstFailure?: string;
} {
  if (!result.detail) return {};
  const summary = result.detail.match(
    /Tests\s+(?:(\d+) failed \| )?(\d+) passed/,
  );
  const failureLine = result.detail.match(/^\s*(?:✗|×|FAIL)\s+.+$/m);
  return {
    ...(summary
      ? { passed: Number(summary[2]), failed: Number(summary[1] ?? 0) }
      : {}),
    ...(failureLine ? { firstFailure: failureLine[0].trim() } : {}),
  };
}
