import { exec as execCallback } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { runFixAgent } from "./agent.js";
import { runCheck } from "./check.js";
import type { Config } from "./config.js";
import type { Exec, ExecResult } from "./context.js";
import type { CheckEvent } from "./events.js";
import type { LanguageAdapter } from "./language-adapter.js";
import { diffSchemas } from "./oasdiff.js";
import type { ApiChange, CheckResult } from "./types.js";

vi.mock("./oasdiff.js", () => ({ diffSchemas: vi.fn() }));
vi.mock("./agent.js", () => ({ runFixAgent: vi.fn() }));

const mockedDiff = vi.mocked(diffSchemas);
const mockedFixAgent = vi.mocked(runFixAgent);

let root: string;

beforeEach(async () => {
  root = await mkdtemp(path.join(tmpdir(), "schemend-check-"));
  await writeFile(path.join(root, "pnpm-lock.yaml"), "lockfileVersion: '9.0'");
  // runCheck's baseline step now swaps each api's real schema file content out and back in
  // (reads it before, restores it after) - a real file needs to exist at each config.apis
  // schema path for that, even though diffSchemas itself is mocked below.
  await writeFile(path.join(root, "schema.json"), "new schema");
  await writeFile(path.join(root, "other.json"), "new schema");
  mockedDiff.mockReset();
  mockedFixAgent.mockReset();
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

const change: ApiChange = {
  id: "response-property-removed:GET:/orders#0",
  severity: "breaking",
  summary: "'totalPrice' was removed from the response",
  target: "GET /orders",
  source: { tool: "oasdiff", id: "response-property-removed", level: 2 },
};

function baseConfig(overrides: Partial<Config> = {}): Config {
  return {
    apis: [{ name: "orders", schema: "schema.json", usedIn: ["src/lib"] }],
    test: "pnpm test",
    platform: "github",
    budgetUsd: 1,
    models: { fix: "claude-sonnet-5", classify: "claude-haiku-4-5-20251001" },
    ...overrides,
  };
}

function makeAdapter(
  overrides: Partial<LanguageAdapter> = {},
): LanguageAdapter {
  return {
    id: "fake",
    detect: async () => true,
    discoverApis: async () => [],
    findAffected: async () => [],
    build: async () =>
      ({ name: "build", status: "passed" }) satisfies CheckResult,
    test: async () =>
      ({ name: "test", status: "passed" }) satisfies CheckResult,
    dockerImage: "fake-image",
    installCommand: "true",
    lockfile: "pnpm-lock.yaml",
    workspaceMarkers: [],
    dependencyVolumePath: "/workspace/node_modules",
    ...overrides,
  };
}

function fakeExec(changedFilesByCall: string[][], calls: string[] = []): Exec {
  let diffCall = 0;
  return async (command: string): Promise<ExecResult> => {
    calls.push(command);
    if (command.includes(" show ")) {
      return { exitCode: 0, stdout: "old schema", stderr: "" };
    }
    if (command.includes(" diff --name-only --cached --relative")) {
      const files = changedFilesByCall[diffCall] ?? [];
      diffCall += 1;
      return { exitCode: 0, stdout: files.join("\n"), stderr: "" };
    }
    return { exitCode: 0, stdout: "", stderr: "" };
  };
}

describe("runCheck", () => {
  it("reports nothing and spends nothing when the schema didn't change", async () => {
    mockedDiff.mockResolvedValue([]);
    const build = vi.fn(makeAdapter().build);
    const adapter = makeAdapter({ build });

    const report = await runCheck({
      config: baseConfig(),
      root,
      exec: fakeExec([]),
      adapters: [adapter],
    });

    expect(report.changes).toEqual([]);
    expect(report.services).toEqual([]);
    expect(report.spentUsd).toBe(0);
    expect(build).not.toHaveBeenCalled();
  });

  it("reports a baseline failure without regenerating or running the agent", async () => {
    mockedDiff.mockResolvedValue([change]);
    const regenerateClient = vi.fn();
    const findAffected = vi.fn(makeAdapter().findAffected);
    const adapter = makeAdapter({
      build: async () => ({ name: "build", status: "failed" }),
      regenerateClient,
      findAffected,
    });

    const report = await runCheck({
      config: baseConfig(),
      root,
      exec: fakeExec([]),
      adapters: [adapter],
    });

    expect(report.services).toHaveLength(1);
    expect(report.services[0]?.branch).toBe("");
    expect(report.services[0]?.confidence).toBe("unverified");
    expect(report.services[0]?.review[0]?.reason).toContain("baseline");
    expect(regenerateClient).not.toHaveBeenCalled();
    expect(findAffected).not.toHaveBeenCalled();
    expect(mockedFixAgent).not.toHaveBeenCalled();
  });

  it("swaps the schema file to its pre-change content for baseline, then restores it", async () => {
    mockedDiff.mockResolvedValue([change]);
    const schemaPath = path.join(root, "schema.json");
    const seenDuringBuild: string[] = [];
    const seenDuringTest: string[] = [];
    const adapter = makeAdapter({
      build: async () => {
        seenDuringBuild.push(await readFile(schemaPath, "utf-8"));
        return { name: "build", status: "passed" };
      },
      test: async () => {
        seenDuringTest.push(await readFile(schemaPath, "utf-8"));
        return { name: "test", status: "passed" };
      },
      findAffected: async () => [],
    });

    await runCheck({
      config: baseConfig(),
      root,
      exec: fakeExec([[]]),
      adapters: [adapter],
    });

    // fakeExec's "git show" branch (writeFileAtRef) returns "old schema"; beforeEach wrote
    // "new schema" as the file's real, current content. build/test run again for the verify
    // step (findAffected returns []), by which point the schema is back to "new schema".
    expect(seenDuringBuild[0]).toBe("old schema");
    expect(seenDuringTest[0]).toBe("old schema");
    expect(seenDuringBuild.at(-1)).toBe("new schema");
    await expect(readFile(schemaPath, "utf-8")).resolves.toBe("new schema");
  });

  it("restores the schema file even when baseline build throws", async () => {
    mockedDiff.mockResolvedValue([change]);
    const schemaPath = path.join(root, "schema.json");
    const adapter = makeAdapter({
      build: async () => {
        throw new Error("boom");
      },
    });

    await expect(
      runCheck({
        config: baseConfig(),
        root,
        exec: fakeExec([]),
        adapters: [adapter],
      }),
    ).rejects.toThrow("boom");

    await expect(readFile(schemaPath, "utf-8")).resolves.toBe("new schema");
  });

  it("regenerates and commits even when nothing needed fixing", async () => {
    mockedDiff.mockResolvedValue([change]);
    const regenerateClient = vi.fn(async () => {
      await writeFile(path.join(root, "generated.ts"), "regenerated");
    });
    const adapter = makeAdapter({
      regenerateClient,
      findAffected: async () => [],
    });
    const calls: string[] = [];

    const report = await runCheck({
      config: baseConfig(),
      root,
      exec: fakeExec([["generated.ts"]], calls),
      adapters: [adapter],
    });

    expect(regenerateClient).toHaveBeenCalledTimes(1);
    expect(mockedFixAgent).not.toHaveBeenCalled();
    expect(report.services[0]?.changedFiles).toEqual(["generated.ts"]);
    expect(report.services[0]?.branch).toBe("schemend/update");
    expect(report.services[0]?.confidence).toBe("verified-by-tests");
    expect(report.services[0]?.costUsd).toBe(0);

    // 2026-10-17 git-exec convention: every git call is scoped via an explicit `-C <root>` in
    // the command string itself, never by relying on exec's own cwd already being root (the
    // mismatch between check.ts/git.ts and pushBranch's convention that caused the GitHub smoke
    // test's getRemoteBranchSha bug, see DECISIONS.md).
    const gitCalls = calls.filter((command) => command.startsWith("git "));
    expect(gitCalls.length).toBeGreaterThan(0);
    for (const command of gitCalls) {
      expect(command).toMatch(new RegExp(`^git -C ${root} `));
    }
  });

  it("runs the fix agent when there are affected locations and reports its result", async () => {
    mockedDiff.mockResolvedValue([change]);
    mockedFixAgent.mockImplementation(async ({ budget }) => {
      await mkdir(path.join(root, "src"), { recursive: true });
      await writeFile(path.join(root, "src/a.ts"), "fixed");
      budget.record(0.05);
      return {
        changedFiles: ["src/a.ts"],
        checks: [{ name: "test", status: "passed" }],
        confidence: "verified-by-tests",
        costUsd: 0.05,
        review: [],
      };
    });
    const adapter = makeAdapter({
      findAffected: async () => [
        { file: "src/a.ts", line: 1, changeId: change.id, snippet: "x" },
      ],
    });

    const report = await runCheck({
      config: baseConfig(),
      root,
      exec: fakeExec([["src/a.ts"]]),
      adapters: [adapter],
    });

    expect(mockedFixAgent).toHaveBeenCalledTimes(1);
    expect(report.services[0]?.changedFiles).toEqual(["src/a.ts"]);
    expect(report.services[0]?.confidence).toBe("verified-by-tests");
    expect(report.services[0]?.costUsd).toBe(0.05);
    expect(report.spentUsd).toBeCloseTo(0.05);
  });

  it("passes the fix agent's review through unchanged, including an agent-flag item's source", async () => {
    mockedDiff.mockResolvedValue([change]);
    mockedFixAgent.mockImplementation(async ({ budget }) => {
      await mkdir(path.join(root, "src"), { recursive: true });
      await writeFile(path.join(root, "src/a.ts"), "fixed");
      budget.record(0.05);
      return {
        changedFiles: ["src/a.ts"],
        checks: [{ name: "test", status: "passed" }],
        confidence: "verified-by-tests",
        costUsd: 0.05,
        review: [
          {
            file: "src/receipt-formatter.ts",
            reason: "hardcoded TL currency suffix",
            source: "agent-flag",
          },
        ],
      };
    });
    const adapter = makeAdapter({
      findAffected: async () => [
        { file: "src/a.ts", line: 1, changeId: change.id, snippet: "x" },
      ],
    });

    const report = await runCheck({
      config: baseConfig(),
      root,
      exec: fakeExec([["src/a.ts"]]),
      adapters: [adapter],
    });

    expect(report.services[0]?.review).toEqual([
      {
        file: "src/receipt-formatter.ts",
        reason: "hardcoded TL currency suffix",
        source: "agent-flag",
      },
    ]);
  });

  it("stops once the shared budget is exhausted and reports the rest as skipped", async () => {
    mockedDiff.mockResolvedValue([change]);
    mockedFixAgent.mockImplementation(async ({ budget }) => {
      budget.record(1);
      return {
        changedFiles: [],
        checks: [],
        confidence: "unverified",
        costUsd: 1,
        review: [],
      };
    });
    const adapter = makeAdapter({
      findAffected: async () => [
        { file: "src/a.ts", line: 1, changeId: change.id, snippet: "x" },
      ],
    });

    const report = await runCheck({
      config: baseConfig({
        apis: [
          { name: "orders", schema: "schema.json", usedIn: ["src/lib"] },
          { name: "other", schema: "other.json", usedIn: ["src/lib"] },
        ],
        budgetUsd: 1,
      }),
      root,
      exec: fakeExec([[], []]),
      adapters: [adapter],
    });

    expect(mockedFixAgent).toHaveBeenCalledTimes(1);
    expect(report.stoppedReason).toBe("budget exceeded");
    expect(report.services).toHaveLength(2);
    expect(report.services[1]?.review[0]?.reason).toContain("budget");
  });

  it("throws when no adapter recognizes the project", async () => {
    mockedDiff.mockResolvedValue([change]);
    const adapter = makeAdapter({ detect: async () => false });

    await expect(
      runCheck({
        config: baseConfig(),
        root,
        exec: fakeExec([]),
        adapters: [adapter],
      }),
    ).rejects.toThrow(/no language adapter/);
  });
});

describe("runCheck cancellation", () => {
  it("stops before touching the first api when already cancelled", async () => {
    mockedDiff.mockResolvedValue([change]);
    const abortController = new AbortController();
    abortController.abort();

    const report = await runCheck({
      config: baseConfig(),
      root,
      exec: fakeExec([]),
      adapters: [makeAdapter()],
      abortController,
    });

    expect(mockedDiff).not.toHaveBeenCalled();
    expect(report.services).toEqual([]);
    expect(report.stoppedReason).toBe("cancelled");
  });

  it("commits what's already regenerated and stops when cancelled right after impact", async () => {
    mockedDiff.mockResolvedValue([change]);
    const abortController = new AbortController();
    const regenerateClient = vi.fn(async () => {
      await writeFile(path.join(root, "generated.ts"), "regenerated");
    });
    const adapter = makeAdapter({
      regenerateClient,
      findAffected: async () => {
        abortController.abort();
        return [
          { file: "src/a.ts", line: 1, changeId: change.id, snippet: "x" },
        ];
      },
    });

    const report = await runCheck({
      config: baseConfig(),
      root,
      exec: fakeExec([["generated.ts"]]),
      adapters: [adapter],
      abortController,
    });

    expect(mockedFixAgent).not.toHaveBeenCalled();
    expect(report.stoppedReason).toBe("cancelled");
    expect(report.services).toHaveLength(1);
    expect(report.services[0]?.changedFiles).toEqual(["generated.ts"]);
    expect(report.services[0]?.review[0]?.reason).toContain("cancelled");
  });

  it("stops with stoppedReason cancelled when the fix agent reports it was cancelled", async () => {
    mockedDiff.mockResolvedValue([change]);
    mockedFixAgent.mockImplementation(async () => ({
      changedFiles: [],
      checks: [],
      confidence: "unverified",
      costUsd: 0,
      review: [{ file: root, reason: "cancelled while fixing" }],
    }));
    const adapter = makeAdapter({
      findAffected: async () => [
        { file: "src/a.ts", line: 1, changeId: change.id, snippet: "x" },
      ],
    });

    const report = await runCheck({
      config: baseConfig(),
      root,
      exec: fakeExec([[]]),
      adapters: [adapter],
    });

    expect(report.stoppedReason).toBe("cancelled");
  });
});

describe("runCheck events", () => {
  it("emits run-started, a passed detect step, and run-finished when nothing changed", async () => {
    mockedDiff.mockResolvedValue([]);
    const events: CheckEvent[] = [];

    await runCheck({
      config: baseConfig(),
      root,
      exec: fakeExec([]),
      adapters: [makeAdapter()],
      onEvent: (event) => events.push(event),
    });

    expect(events.map((event) => event.type)).toEqual([
      "run-started",
      "step-started",
      "step-finished",
      "run-finished",
    ]);
    expect(events[0]).toMatchObject({ type: "run-started", apis: ["orders"] });
    expect(events[2]).toMatchObject({
      type: "step-finished",
      step: "detect",
      status: "passed",
    });
  });

  it("emits a failed baseline step and a service-completed event, tagged with the reason", async () => {
    mockedDiff.mockResolvedValue([change]);
    const events: CheckEvent[] = [];
    const adapter = makeAdapter({
      build: async () => ({ name: "build", status: "failed" }),
    });

    await runCheck({
      config: baseConfig(),
      root,
      exec: fakeExec([]),
      adapters: [adapter],
      onEvent: (event) => events.push(event),
    });

    expect(events.map((event) => event.type)).toEqual([
      "run-started",
      "step-started",
      "changes-detected",
      "step-finished",
      "step-started",
      "check-result",
      "check-result",
      "step-finished",
      "service-completed",
      "run-finished",
    ]);
    const baselineFinished = events[7];
    expect(baselineFinished).toMatchObject({
      type: "step-finished",
      step: "baseline",
      status: "failed",
      reason: "baseline-failed",
    });
    for (const event of events) expect(typeof event.timestamp).toBe("string");
  });

  it("emits detect/baseline/regenerate/impact/commit steps and one service-completed when nothing needed fixing", async () => {
    mockedDiff.mockResolvedValue([change]);
    const events: CheckEvent[] = [];
    const adapter = makeAdapter({
      regenerateClient: async () => {
        await writeFile(path.join(root, "generated.ts"), "regenerated");
      },
      findAffected: async () => [],
    });

    await runCheck({
      config: baseConfig(),
      root,
      exec: fakeExec([["generated.ts"]]),
      adapters: [adapter],
      onEvent: (event) => events.push(event),
    });

    const steps = events
      .filter((event) => event.type === "step-started")
      .map((event) => event.step);
    expect(steps).toEqual([
      "detect",
      "baseline",
      "regenerate",
      "impact",
      "verify",
      "commit",
    ]);
    expect(
      events.filter((event) => event.type === "service-completed"),
    ).toHaveLength(1);
    expect(events.at(-1)?.type).toBe("run-finished");
  });
});

const GIT_ENV = "-c user.email=a@b.c -c user.name=a -c commit.gpgsign=false";

function realExecIn(cwd: string): Exec {
  return (command) =>
    new Promise<ExecResult>((resolve) => {
      execCallback(command, { cwd }, (error, stdout, stderr) => {
        resolve({
          exitCode: !error
            ? 0
            : typeof error.code === "number"
              ? error.code
              : 1,
          stdout,
          stderr,
        });
      });
    });
}

/**
 * Real git for every `git ...` command (the baseRef-resolution bug this tests for is a property
 * of git's own ref semantics, not something a canned-response fake can reproduce), a trivial
 * success for everything else (Docker/pnpm install) - the same blanket-success shape fakeExec
 * gives those commands elsewhere in this file, just without faking the git side too.
 */
function hybridExec(root: string): Exec {
  const real = realExecIn(root);
  return async (command, env) => {
    if (command.trimStart().startsWith("git ")) {
      return real(command, env);
    }
    return { exitCode: 0, stdout: "", stderr: "" };
  };
}

describe("runCheck baseRef resolution", () => {
  it("detects a schema change for every api, not just the first, when they all change in the same commit", async () => {
    const exec = hybridExec(root);
    await exec("git init -q");
    await writeFile(path.join(root, "schema-a.json"), "old-a");
    await writeFile(path.join(root, "schema-b.json"), "old-b");
    await exec("git add -A");
    await exec(`git ${GIT_ENV} commit -q -m first`);
    // Both schemas change together in one commit - the realistic case: a real CI run on a push
    // that touched two services at once, not two separate schema-change commits.
    await writeFile(path.join(root, "schema-a.json"), "new-a");
    await writeFile(path.join(root, "schema-b.json"), "new-b");
    await exec("git add -A");
    await exec(`git ${GIT_ENV} commit -q -m second`);

    mockedDiff.mockImplementation(async (oldFile, newFile) => {
      const [oldContent, newContent] = await Promise.all([
        readFile(oldFile, "utf-8"),
        readFile(newFile, "utf-8"),
      ]);
      return oldContent === newContent ? [] : [change];
    });
    const regenerateClient = vi.fn(async (_ctx, apiEntry) => {
      // A real fix commit lands between the two apis' turns, exactly like check.ts's own
      // commitAll - this is what used to move a bare "HEAD~1" out from under the second api.
      await writeFile(path.join(root, `${apiEntry.name}-generated.ts`), "x");
    });
    const adapter = makeAdapter({
      regenerateClient,
      findAffected: async () => [],
    });

    const report = await runCheck({
      config: baseConfig({
        apis: [
          { name: "a", schema: "schema-a.json", usedIn: [] },
          { name: "b", schema: "schema-b.json", usedIn: [] },
        ],
      }),
      root,
      exec,
      adapters: [adapter],
    });

    expect(report.services).toHaveLength(2);
    expect(report.services.every((s) => s.branch === "schemend/update")).toBe(
      true,
    );
    expect(report.services.flatMap((s) => s.changedFiles)).toEqual(
      expect.arrayContaining(["a-generated.ts", "b-generated.ts"]),
    );
  });
});
