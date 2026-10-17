import { beforeEach, describe, expect, it, vi } from "vitest";
import { runCheck } from "./check.js";
import type { Config } from "./config.js";
import type { Exec } from "./context.js";
import type { CheckEvent } from "./events.js";
import type { PlatformAdapter } from "./platform-adapter.js";
import {
  ChangeRequestFailedAfterPushError,
  isIncomplete,
  pushSkipReason,
  runRun,
} from "./run.js";
import type {
  ApiChange,
  ChangeRequest,
  RunReport,
  ServiceResult,
} from "./types.js";

vi.mock("./check.js", () => ({ runCheck: vi.fn() }));

const mockedRunCheck = vi.mocked(runCheck);

beforeEach(() => {
  mockedRunCheck.mockReset();
});

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

function makeService(overrides: Partial<ServiceResult> = {}): ServiceResult {
  return {
    service: "checkout-web",
    language: "typescript",
    branch: "schemend/update",
    steps: ["detect", "baseline", "regenerate", "impact", "fix", "verify"],
    changedFiles: ["src/lib/shipping.ts"],
    checks: [
      { name: "build", status: "passed" },
      { name: "test", status: "passed" },
    ],
    review: [],
    confidence: "verified-by-tests",
    costUsd: 0.05,
    ...overrides,
  };
}

const change: ApiChange = {
  id: "response-property-removed:GET:/orders#0",
  severity: "breaking",
  summary: "'totalPrice' was removed from the response",
  target: "GET /orders",
  source: { tool: "oasdiff", id: "response-property-removed", level: 2 },
};

/** Drives runCheck's mock implementation: emits a service-completed per pair, then run-finished, matching what the real runCheck does. */
function mockRunCheckWith(
  report: RunReport,
  apiServicePairs: Array<{ api: string; service: ServiceResult }>,
  extraEvents: CheckEvent[] = [],
): void {
  mockedRunCheck.mockImplementation(async (options) => {
    for (const event of extraEvents) options.onEvent?.(event);
    for (const { api, service } of apiServicePairs) {
      options.onEvent?.({
        type: "service-completed",
        timestamp: new Date().toISOString(),
        api,
        service,
      });
    }
    options.onEvent?.({
      type: "run-finished",
      timestamp: new Date().toISOString(),
      report,
    });
    return report;
  });
}

function makePlatform(
  overrides: Partial<PlatformAdapter> = {},
): PlatformAdapter {
  return {
    id: "github",
    maxBodyLength: 65_000,
    detectCi: () => false,
    getDefaultBranch: vi.fn(async () => "main"),
    pushBranch: vi.fn(async () => {}),
    openChangeRequest: vi.fn(
      async (): Promise<ChangeRequest> => ({
        url: "https://example.com/pr/1",
        number: 1,
      }),
    ),
    comment: vi.fn(async () => {}),
    ...overrides,
  };
}

const exec: Exec = async () => ({ exitCode: 0, stdout: "", stderr: "" });

describe("runRun", () => {
  it("pushes nothing when there are no changes", async () => {
    const report: RunReport = {
      api: "orders",
      startedAt: "t0",
      finishedAt: "t1",
      changes: [],
      services: [],
      budgetUsd: 1,
      spentUsd: 0,
    };
    mockRunCheckWith(report, []);
    const platform = makePlatform();
    const events: CheckEvent[] = [];

    const result = await runRun({
      config: baseConfig(),
      root: "/repo/consumer",
      exec,
      adapters: [],
      platform,
      onEvent: (event) => events.push(event),
    });

    expect(result).toEqual(report);
    expect(platform.pushBranch).not.toHaveBeenCalled();
    expect(platform.openChangeRequest).not.toHaveBeenCalled();
    expect(
      events.some(
        (event) => event.type === "step-started" && event.step === "push",
      ),
    ).toBe(false);
    expect(
      events.filter((event) => event.type === "run-finished"),
    ).toHaveLength(1);
  });

  it("pushes nothing when a service carries an orchestrator-generated review item (incomplete run)", async () => {
    const service = makeService({
      review: [
        { file: "/repo/consumer", reason: "baseline build/test failed" },
      ],
      confidence: "unverified",
    });
    const report: RunReport = {
      api: "orders",
      startedAt: "t0",
      finishedAt: "t1",
      changes: [change],
      services: [service],
      budgetUsd: 1,
      spentUsd: 0,
    };
    mockRunCheckWith(report, [{ api: "orders", service }]);
    const platform = makePlatform();

    await runRun({
      config: baseConfig(),
      root: "/repo/consumer",
      exec,
      adapters: [],
      platform,
    });

    expect(platform.pushBranch).not.toHaveBeenCalled();
    expect(platform.openChangeRequest).not.toHaveBeenCalled();
  });

  it("pushes nothing when the agent's own flag doesn't count as incomplete, but stoppedReason does", async () => {
    const flaggedService = makeService({
      review: [
        {
          file: "src/lib/format.ts",
          reason: "hardcoded currency",
          source: "agent-flag",
        },
      ],
    });
    const report: RunReport = {
      api: "orders",
      startedAt: "t0",
      finishedAt: "t1",
      changes: [change],
      services: [flaggedService],
      budgetUsd: 1,
      spentUsd: 0,
      stoppedReason: "budget exceeded",
    };
    mockRunCheckWith(report, [{ api: "orders", service: flaggedService }]);
    const platform = makePlatform();

    await runRun({
      config: baseConfig(),
      root: "/repo/consumer",
      exec,
      adapters: [],
      platform,
    });

    expect(platform.pushBranch).not.toHaveBeenCalled();
  });

  it("pushes the branch and opens a PR, attaching the ChangeRequest to every pushable service", async () => {
    const fixed = makeService();
    const untouched = makeService({
      branch: "",
      changedFiles: [],
      steps: ["detect"],
    });
    const report: RunReport = {
      api: "orders",
      startedAt: "t0",
      finishedAt: "t1",
      changes: [change],
      services: [fixed, untouched],
      budgetUsd: 1,
      spentUsd: 0.05,
    };
    mockRunCheckWith(report, [
      { api: "orders", service: fixed },
      { api: "orders", service: untouched },
    ]);
    const changeRequest: ChangeRequest = {
      url: "https://example.com/pr/7",
      number: 7,
    };
    const platform = makePlatform({
      openChangeRequest: vi.fn(async () => changeRequest),
    });

    const result = await runRun({
      config: baseConfig(),
      root: "/repo/consumer",
      exec,
      adapters: [],
      platform,
    });

    expect(platform.pushBranch).toHaveBeenCalledWith(
      "/repo/consumer",
      "schemend/update",
      exec,
    );
    expect(platform.getDefaultBranch).toHaveBeenCalled();
    expect(platform.openChangeRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        branch: "schemend/update",
        baseBranch: "main",
      }),
    );
    expect(result.services[0]?.changeRequest).toEqual(changeRequest);
    expect(result.services[1]?.changeRequest).toBeUndefined();
  });

  it("builds the PR body from one ApiServiceResult per completed api, not just the generic services list", async () => {
    const orders = makeService({ costUsd: 0.05 });
    const inventory = makeService({
      costUsd: 0.02,
      steps: ["detect", "baseline"],
    });
    const report: RunReport = {
      api: "orders, inventory",
      startedAt: "t0",
      finishedAt: "t1",
      changes: [change],
      services: [orders, inventory],
      budgetUsd: 1,
      spentUsd: 0.07,
    };
    mockRunCheckWith(report, [
      { api: "orders", service: orders },
      { api: "inventory", service: inventory },
    ]);
    let capturedBody = "";
    const platform = makePlatform({
      openChangeRequest: vi.fn(async ({ body }) => {
        capturedBody = body;
        return { url: "https://example.com/pr/9", number: 9 };
      }),
    });

    await runRun({
      config: baseConfig(),
      root: "/repo/consumer",
      exec,
      adapters: [],
      platform,
    });

    expect(capturedBody).toContain("### orders");
    expect(capturedBody).toContain("### inventory");
  });

  it("throws the original error (not wrapped) and emits a failed push step when pushBranch itself fails", async () => {
    const service = makeService();
    const report: RunReport = {
      api: "orders",
      startedAt: "t0",
      finishedAt: "t1",
      changes: [change],
      services: [service],
      budgetUsd: 1,
      spentUsd: 0.05,
    };
    mockRunCheckWith(report, [{ api: "orders", service }]);
    const pushError = new Error("network down");
    const platform = makePlatform({
      pushBranch: vi.fn(async () => {
        throw pushError;
      }),
    });
    const events: CheckEvent[] = [];

    await expect(
      runRun({
        config: baseConfig(),
        root: "/repo/consumer",
        exec,
        adapters: [],
        platform,
        onEvent: (event) => events.push(event),
      }),
    ).rejects.toBe(pushError);

    expect(platform.openChangeRequest).not.toHaveBeenCalled();
    const pushFinished = events.find(
      (event) => event.type === "step-finished" && event.step === "push",
    );
    expect(pushFinished).toMatchObject({
      status: "failed",
      reason: "push-failed",
    });
  });

  it("wraps a post-push PR failure with a distinguishable error naming the branch", async () => {
    const service = makeService();
    const report: RunReport = {
      api: "orders",
      startedAt: "t0",
      finishedAt: "t1",
      changes: [change],
      services: [service],
      budgetUsd: 1,
      spentUsd: 0.05,
    };
    mockRunCheckWith(report, [{ api: "orders", service }]);
    const platform = makePlatform({
      openChangeRequest: vi.fn(async () => {
        throw new Error("GitHub API down");
      }),
    });

    let thrown: unknown;
    try {
      await runRun({
        config: baseConfig(),
        root: "/repo/consumer",
        exec,
        adapters: [],
        platform,
      });
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(ChangeRequestFailedAfterPushError);
    expect((thrown as Error).message).toMatch(
      /pushed branch "schemend\/update"/,
    );
    expect(platform.pushBranch).toHaveBeenCalledTimes(1);
  });

  it("forwards every other event unchanged, but swallows runCheck's own run-finished for its own, final one", async () => {
    const service = makeService();
    const report: RunReport = {
      api: "orders",
      startedAt: "t0",
      finishedAt: "t1",
      changes: [change],
      services: [service],
      budgetUsd: 1,
      spentUsd: 0.05,
    };
    const detectFinished: CheckEvent = {
      type: "step-finished",
      timestamp: new Date().toISOString(),
      api: "orders",
      step: "detect",
      durationMs: 5,
      status: "passed",
    };
    mockRunCheckWith(report, [{ api: "orders", service }], [detectFinished]);
    const changeRequest: ChangeRequest = {
      url: "https://example.com/pr/3",
      number: 3,
    };
    const platform = makePlatform({
      openChangeRequest: vi.fn(async () => changeRequest),
    });
    const events: CheckEvent[] = [];

    await runRun({
      config: baseConfig(),
      root: "/repo/consumer",
      exec,
      adapters: [],
      platform,
      onEvent: (event) => events.push(event),
    });

    expect(events).toContainEqual(detectFinished);
    const finishedEvents = events.filter(
      (event) => event.type === "run-finished",
    );
    expect(finishedEvents).toHaveLength(1);
    const onlyFinished = finishedEvents[0];
    if (onlyFinished?.type !== "run-finished") throw new Error("unreachable");
    expect(onlyFinished.report.services[0]?.changeRequest).toEqual(
      changeRequest,
    );
  });
});

describe("isIncomplete", () => {
  it("is false for a fully completed report with no review items", () => {
    const report: RunReport = {
      api: "orders",
      startedAt: "t0",
      finishedAt: "t1",
      changes: [change],
      services: [makeService()],
      budgetUsd: 1,
      spentUsd: 0.05,
    };
    expect(isIncomplete(report)).toBe(false);
  });

  it("is true when stoppedReason is set, even with no review items", () => {
    const report: RunReport = {
      api: "orders",
      startedAt: "t0",
      finishedAt: "t1",
      changes: [change],
      services: [makeService()],
      budgetUsd: 1,
      spentUsd: 1,
      stoppedReason: "budget exceeded",
    };
    expect(isIncomplete(report)).toBe(true);
  });

  it("is true when a service carries an orchestrator review item, without stoppedReason", () => {
    const report: RunReport = {
      api: "orders",
      startedAt: "t0",
      finishedAt: "t1",
      changes: [change],
      services: [
        makeService({
          review: [{ file: "/repo/consumer", reason: "baseline failed" }],
        }),
      ],
      budgetUsd: 1,
      spentUsd: 0,
    };
    expect(isIncomplete(report)).toBe(true);
  });

  it("is false when the only review item is agent-flagged", () => {
    const report: RunReport = {
      api: "orders",
      startedAt: "t0",
      finishedAt: "t1",
      changes: [change],
      services: [
        makeService({
          review: [
            {
              file: "src/lib/format.ts",
              reason: "hardcoded currency",
              source: "agent-flag",
            },
          ],
        }),
      ],
      budgetUsd: 1,
      spentUsd: 0.05,
    };
    expect(isIncomplete(report)).toBe(false);
  });
});

describe("pushSkipReason", () => {
  it("is 'no-changes' when no service has a branch, even if the run is otherwise incomplete", () => {
    const report: RunReport = {
      api: "orders",
      startedAt: "t0",
      finishedAt: "t1",
      changes: [],
      services: [],
      budgetUsd: 1,
      spentUsd: 0,
      stoppedReason: "cancelled",
    };
    expect(pushSkipReason(report)).toBe("no-changes");
  });

  it("is 'incomplete-run' when a branch exists but the run didn't finish", () => {
    const report: RunReport = {
      api: "orders",
      startedAt: "t0",
      finishedAt: "t1",
      changes: [change],
      services: [makeService()],
      budgetUsd: 1,
      spentUsd: 1,
      stoppedReason: "budget exceeded",
    };
    expect(pushSkipReason(report)).toBe("incomplete-run");
  });

  it("is undefined when there's a pushable branch and the run completed", () => {
    const report: RunReport = {
      api: "orders",
      startedAt: "t0",
      finishedAt: "t1",
      changes: [change],
      services: [makeService()],
      budgetUsd: 1,
      spentUsd: 0.05,
    };
    expect(pushSkipReason(report)).toBeUndefined();
  });
});
