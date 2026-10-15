import type { AdapterContext, CheckResult } from "@schemend/core";
import { resolveBuildTarget } from "./project.js";

// dotnet writes a harmless "verifying workloads" notice to stderr on every run, success or
// failure - picking stderr over stdout whenever it's non-empty would hide the real compiler
// output (which lands on stdout) behind that notice. Both streams are combined instead.
const MAX_DETAIL_LENGTH = 4000;

function truncate(text: string): string {
  if (text.length <= MAX_DETAIL_LENGTH) return text;
  const half = MAX_DETAIL_LENGTH / 2;
  return `${text.slice(0, half)}\n...[truncated]...\n${text.slice(-half)}`;
}

function toCheckResult(
  name: string,
  exitCode: number,
  stdout: string,
  stderr: string,
): CheckResult {
  if (exitCode === 0) return { name, status: "passed" };
  const combined = [stdout, stderr].filter(Boolean).join("\n");
  return { name, status: "failed", detail: truncate(combined) };
}

// `<file>(line,col): error CSxxxx: <message> [<project>]` - MSBuild's standard console format
// (same shape impact.ts's own ERROR_LINE_RE parses, any error code rather than just CS so an
// MSBuild-level error like MSB3073 - seen for real when a NSwag Exec command itself fails -
// still counts). Repeats once inline and once more in the "Build FAILED" summary, so distinct
// file:line:code triples (not raw line count) is the error count.
const BUILD_ERROR_LINE_RE =
  /^(.+)\((\d+,\d+)\): error ([A-Z]+\d+): (.*?)(?: \[.*\])?$/;

export function summarizeBuildFailure(result: CheckResult): {
  errorCount?: number;
  firstError?: string;
} {
  if (!result.detail) return {};
  const seen = new Set<string>();
  let firstError: string | undefined;
  for (const line of result.detail.split("\n")) {
    const match = line.match(BUILD_ERROR_LINE_RE);
    if (!match) continue;
    const [, file, loc, code, message] = match;
    const key = `${file}:${loc}:${code}`;
    if (seen.has(key)) continue;
    seen.add(key);
    firstError ??= `${code}: ${message}`;
  }
  if (seen.size === 0) return {};
  return {
    errorCount: seen.size,
    ...(firstError !== undefined ? { firstError } : {}),
  };
}

// dotnet test's console runner summary ("Failed!  - Failed:     1, Passed:     1, Skipped: 0,
// Total: 2, ...", or "Passed!  - Failed: 0, ..." when every test passes) and its per-failure
// marker line ("  Failed <Namespace>.<Class>.<Method> [4 ms]") - captured from a real `dotnet
// test` run against a deliberately broken assertion.
const TEST_SUMMARY_RE =
  /(?:Passed|Failed)!\s+-\s+Failed:\s*(\d+),\s*Passed:\s*(\d+)/;
const TEST_FAILURE_LINE_RE = /^\s*Failed\s+(\S+)/m;

export function summarizeTestResult(result: CheckResult): {
  passed?: number;
  failed?: number;
  firstFailure?: string;
} {
  if (!result.detail) return {};
  const summary = result.detail.match(TEST_SUMMARY_RE);
  const firstFailure = result.detail.match(TEST_FAILURE_LINE_RE)?.[1];
  return {
    ...(summary
      ? { failed: Number(summary[1]), passed: Number(summary[2]) }
      : {}),
    ...(firstFailure !== undefined ? { firstFailure } : {}),
  };
}

/** Targets the test project when one exists, not just the main project - mirrors Java's `test-compile` reach (building it also compiles the main project via ProjectReference). */
export async function build(ctx: AdapterContext): Promise<CheckResult> {
  const target = await resolveBuildTarget(ctx.root);
  const result = await ctx.exec(
    `dotnet build ${target.commandPath} --no-restore`,
  );
  return toCheckResult("build", result.exitCode, result.stdout, result.stderr);
}

export async function test(ctx: AdapterContext): Promise<CheckResult> {
  const target = await resolveBuildTarget(ctx.root);
  const result = await ctx.exec(
    `dotnet test ${target.commandPath} --no-restore`,
  );
  return toCheckResult("test", result.exitCode, result.stdout, result.stderr);
}
