import type { AdapterContext, CheckResult } from "@schemend/core";

// Picking stderr over stdout whenever it's non-empty risks hiding real output on the other
// stream behind an unrelated message on this one (found to actually happen for dotnet, see
// lang-csharp's checks.ts) - combining both is the safer default regardless of which stream a
// given tool happens to use for its real errors.
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
