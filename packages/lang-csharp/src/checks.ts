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
