import type { AdapterContext, CheckResult } from "@schemend/core";

// Picking stderr over stdout whenever non-empty risks hiding real output behind an unrelated
// message on the other stream (found to happen for dotnet, see lang-csharp's checks.ts).
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

// javac's `[ERROR] <path>.java:[line,col] <message>` (same shape impact.ts's ERROR_LINE_RE
// parses) repeats once mid-build and once in the summary, so distinct file:line pairs - not
// raw line count - is the error count.
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

// Surefire's end-of-run aggregate line ("Tests run: 3, Failures: 1, ...", no trailing "Time
// elapsed" - that's only on the per-test-class line) and its failure marker.
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
