import { copyFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { ContainerUser, Exec } from "@schemend/core";
import { javaAdapter } from "@schemend/lang-java";
import { typescriptAdapter } from "@schemend/lang-typescript";
import { type CheckResult, runChecks } from "./checks.js";
import {
  type ConsumerDockerExec,
  createConsumerExecFactory,
} from "./docker.js";
import { runCommand } from "./exec.js";
import { discoverScenarios, type RunnerRow, runScenario } from "./runner.js";
import type { ConsumerExpectation, Scenario } from "./scenario.js";
import { noopSolver, type Solver } from "./solver.js";
import { createWorktree } from "./worktree.js";

const evalRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const scenariosDir = path.join(evalRoot, "scenarios");

function resolveSourceRoot(source: string): string {
  // Assumes the sibling-repo layout from CLAUDE.md: ~/Projects/<source>.
  return path.resolve(evalRoot, "..", "..", source);
}

async function runSetupCommand(command: string, exec: Exec): Promise<void> {
  const result = await exec(command);
  if (result.exitCode !== 0) {
    throw new Error(`"${command}" failed:\n${result.stderr || result.stdout}`);
  }
}

async function runSetup(
  expectation: ConsumerExpectation,
  exec: Exec,
): Promise<void> {
  for (const command of expectation.setup ?? []) {
    await runSetupCommand(command, exec);
  }
}

interface ReadyConsumer {
  key: string;
  dir: string;
  expectation: ConsumerExpectation;
  consumerExec: ConsumerDockerExec;
}

/**
 * Picks each consumer's LanguageAdapter and Docker context (see docker.ts); never falls back to
 * a plain host exec - if Docker itself is unreachable, this throws and the scenario is reported
 * as "error" by main()'s own try/catch, same as any other scenario-level failure.
 */
export type CreateConsumerExec = (dir: string) => Promise<ConsumerDockerExec>;

// worktree @ref -> per consumer baseline (setup + checks against the schema still on disk at
// ref; a failing baseline means the fixture itself is broken, not the solver, so that consumer
// is marked "invalid" and skipped) -> apply schemaAfter -> per ready consumer: re-run setup so
// generated types reflect the change -> solver -> mustNotContain -> checks -> judge -> cleanup.
export async function runScenarioInWorktree(
  scenario: Scenario,
  solver: Solver,
  createConsumerExec: CreateConsumerExec,
): Promise<RunnerRow[]> {
  const sourceRoot = resolveSourceRoot(scenario.source);
  const worktree = await createWorktree(sourceRoot, scenario.ref);
  const volumeCleanups: Array<() => Promise<void>> = [];
  try {
    const rows: RunnerRow[] = [];
    const ready: ReadyConsumer[] = [];

    for (const [key, expectation] of Object.entries(scenario.consumers)) {
      const dir = path.join(worktree.dir, key);
      const consumerExec = await createConsumerExec(dir);
      volumeCleanups.push(consumerExec.cleanup);

      await runSetup(expectation, consumerExec.setupExec);

      const baseline: CheckResult[] | undefined =
        expectation.checks && expectation.checks.length > 0
          ? await runChecks(consumerExec.checkExec, expectation.checks)
          : undefined;
      const baselineFailed = baseline?.some(
        (check) => check.status === "failed",
      );
      if (baseline) {
        console.log(
          `[baseline] ${scenario.id}/${key}: ${baselineFailed ? "failed" : "passed"}`,
        );
      }
      if (baselineFailed) {
        rows.push({
          scenarioId: scenario.id,
          consumer: key,
          real: scenario.real,
          expected: expectation.expected,
          result: "invalid",
          ...(baseline !== undefined ? { checks: baseline } : {}),
        });
        continue;
      }

      ready.push({ key, dir, expectation, consumerExec });
    }

    if (ready.length > 0) {
      await copyFile(
        path.join(scenariosDir, scenario.id, scenario.schemaAfter),
        path.join(worktree.dir, scenario.providerSchema),
      );

      const consumerDirs: Record<string, string> = {};
      const consumerExecs: Record<string, Exec> = {};
      for (const { key, dir, expectation, consumerExec } of ready) {
        await runSetup(expectation, consumerExec.setupExec);
        consumerDirs[key] = dir;
        consumerExecs[key] = consumerExec.checkExec;
      }

      const readyScenario: Scenario = {
        ...scenario,
        consumers: Object.fromEntries(
          ready.map(({ key, expectation }) => [key, expectation]),
        ),
      };
      rows.push(
        ...(await runScenario(
          readyScenario,
          consumerDirs,
          solver,
          consumerExecs,
        )),
      );
    }

    return rows;
  } finally {
    // Each consumer's dependency volume is specific to this run's own tmp worktree path (see
    // docker.ts), so it's thrown away alongside the worktree rather than left for a cache that
    // would never be found again (schemend-deps-* volume names are keyed by root path).
    await Promise.all(volumeCleanups.map((cleanup) => cleanup()));
    await worktree.cleanup();
  }
}

const CORRECT_VERDICTS = new Set([
  "correct-fix",
  "correct-flag",
  "correct-untouched",
]);

function detailPreview(detail: string | undefined, maxLines = 3): string {
  if (!detail) return "";
  return detail
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, maxLines)
    .join(" | ");
}

function formatChecks(checks: RunnerRow["checks"]): string {
  if (!checks || checks.length === 0) return "-";
  const failed = checks.filter((check) => check.status === "failed");
  if (failed.length === 0) return "passed";
  return failed
    .map((check) => `${check.name}: ${detailPreview(check.detail)}`)
    .join(" / ");
}

function formatDetail(row: RunnerRow): string {
  if (row.result === "error") return row.error ?? "error";
  return formatChecks(row.checks);
}

function printReport(rows: RunnerRow[]): void {
  if (rows.length === 0) {
    console.log("No scenarios found in eval/scenarios.");
    return;
  }

  console.table(
    rows.map((row) => ({
      scenario: row.scenarioId,
      consumer: row.consumer,
      kind: row.real ? "real" : "simulated",
      expected: row.expected,
      result: row.result,
      checks: formatDetail(row),
    })),
  );

  const totals = {
    real: { total: 0, correct: 0 },
    simulated: { total: 0, correct: 0 },
  };
  let invalid = 0;
  let errored = 0;
  for (const row of rows) {
    if (row.result === "invalid") {
      invalid += 1;
      continue;
    }
    if (row.result === "error") {
      errored += 1;
      continue;
    }
    const bucket = row.real ? totals.real : totals.simulated;
    bucket.total += 1;
    if (CORRECT_VERDICTS.has(row.result)) bucket.correct += 1;
  }
  console.log(`Real:      ${totals.real.correct}/${totals.real.total} correct`);
  console.log(
    `Simulated: ${totals.simulated.correct}/${totals.simulated.total} correct`,
  );
  if (invalid > 0) {
    console.log(`Invalid (baseline failed, not counted above): ${invalid}`);
  }
  if (errored > 0) {
    console.log(`Errored (scenario crashed, not counted above): ${errored}`);
  }
}

function firstLine(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message.split("\n")[0] ?? message;
}

const hostExec: Exec = (command) => runCommand(command, evalRoot);

function containerUser(): ContainerUser | undefined {
  const uid = process.getuid?.();
  const gid = process.getgid?.();
  return uid !== undefined && gid !== undefined ? { uid, gid } : undefined;
}

async function main(): Promise<void> {
  const scenarios = await discoverScenarios(scenariosDir);

  // Stale worktree metadata from a previous crashed run would otherwise make
  // `git worktree add` fail with "already exists" the next time around.
  const sourceRoots = new Set(
    scenarios.map((s) => resolveSourceRoot(s.source)),
  );
  for (const sourceRoot of sourceRoots) {
    await runCommand("git worktree prune", sourceRoot);
  }

  const createConsumerExec = createConsumerExecFactory(
    [typescriptAdapter, javaAdapter],
    hostExec,
    containerUser(),
  );

  const rows: RunnerRow[] = [];
  for (const scenario of scenarios) {
    try {
      rows.push(
        ...(await runScenarioInWorktree(
          scenario,
          noopSolver,
          createConsumerExec,
        )),
      );
    } catch (error) {
      rows.push({
        scenarioId: scenario.id,
        consumer: "-",
        real: scenario.real,
        expected: "-",
        result: "error",
        error: firstLine(error),
      });
    }
  }
  printReport(rows);
}

const isMainModule = process.argv[1] === fileURLToPath(import.meta.url);
if (isMainModule) {
  main().catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  });
}
