import type { CheckResult, Exec } from "@schemend/core";

export type { CheckResult } from "@schemend/core";

export async function runChecks(
  exec: Exec,
  commands: string[],
): Promise<CheckResult[]> {
  const results: CheckResult[] = [];
  for (const command of commands) {
    const { exitCode, stdout, stderr } = await exec(command);
    results.push(
      exitCode === 0
        ? { name: command, status: "passed" }
        : {
            name: command,
            status: "failed",
            // tsc/mvn/dotnet print the actual diagnostics on stdout; stderr is usually
            // just the wrapper's "command failed" noise. Keep both, stdout first.
            detail: [stdout, stderr].filter(Boolean).join("\n").slice(-2000),
          },
    );
  }
  return results;
}
