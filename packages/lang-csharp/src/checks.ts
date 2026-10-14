import type { AdapterContext, CheckResult } from "@schemend/core";
import { resolveBuildTarget } from "./project.js";

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
