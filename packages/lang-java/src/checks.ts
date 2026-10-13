import type { AdapterContext, CheckResult } from "@schemend/core";

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

/** `test-compile`, not just `compile`, so a schema change that only breaks a test fixture still fails this check - mirrors tsc typechecking the whole project (main + test) in one pass. */
export async function build(ctx: AdapterContext): Promise<CheckResult> {
  const result = await ctx.exec("mvn -q -B test-compile");
  return toCheckResult(
    "compile",
    result.exitCode,
    result.stdout,
    result.stderr,
  );
}

export async function test(ctx: AdapterContext): Promise<CheckResult> {
  const result = await ctx.exec("mvn -q -B test");
  return toCheckResult("test", result.exitCode, result.stdout, result.stderr);
}
