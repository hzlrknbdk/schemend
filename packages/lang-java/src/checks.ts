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

// `[ERROR] <path>.java:[line,col] <message>` - javac's own diagnostic line (same shape
// impact.ts's ERROR_LINE_RE parses), captured from a real `mvn -q test-compile` run. A removed/
// renamed field's error repeats once in the mid-build banner and once in the end-of-build
// summary, so distinct file:line pairs (not raw line count) is the error count.
const BUILD_ERROR_LINE_RE = /^\[ERROR\] (.+\.java):(\[\d+,\d+\]) (.*)$/;

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
    const [, file, loc, message] = match;
    const key = `${file}${loc}`;
    if (seen.has(key)) continue;
    seen.add(key);
    firstError ??= `${file}${loc} ${message}`;
  }
  if (seen.size === 0) return {};
  return {
    errorCount: seen.size,
    ...(firstError !== undefined ? { firstError } : {}),
  };
}

// Maven surefire's end-of-run aggregate line ("Tests run: 3, Failures: 1, Errors: 0, Skipped: 0",
// no trailing "Time elapsed" - that suffix only appears on the earlier, per-test-class line) and
// its "[ERROR]   <Class>.<method>:<line>" failure marker - captured from a real `mvn -q -B test`
// run against a deliberately broken assertion.
const TEST_SUMMARY_RE =
  /Tests run: (\d+), Failures: (\d+), Errors: (\d+), Skipped: (\d+)$/gm;
const TEST_FAILURE_LINE_RE = /^\[ERROR\]\s+(\S+:\d+)\s*$/m;

export function summarizeTestResult(result: CheckResult): {
  passed?: number;
  failed?: number;
  firstFailure?: string;
} {
  if (!result.detail) return {};
  const summaries = [...result.detail.matchAll(TEST_SUMMARY_RE)];
  const summary = summaries.at(-1);
  const firstFailure = result.detail.match(TEST_FAILURE_LINE_RE)?.[1];
  if (!summary) {
    return firstFailure !== undefined ? { firstFailure } : {};
  }
  const total = Number(summary[1]);
  const failed = Number(summary[2]) + Number(summary[3]);
  return {
    passed: total - failed,
    failed,
    ...(firstFailure !== undefined ? { firstFailure } : {}),
  };
}
