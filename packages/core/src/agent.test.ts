import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { AbortError, query } from "@anthropic-ai/claude-agent-sdk";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { runFixAgent } from "./agent.js";
import { Budget } from "./budget.js";
import type { CheckEvent } from "./events.js";
import type { AffectedLocation, ApiChange, CheckResult } from "./types.js";

vi.mock("@anthropic-ai/claude-agent-sdk", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@anthropic-ai/claude-agent-sdk")>();
  return { ...actual, query: vi.fn() };
});

const mockedQuery = vi.mocked(query);

function fakeQuery(messages: unknown[]) {
  return (async function* () {
    for (const message of messages) yield message;
    // biome-ignore lint/suspicious/noExplicitAny: test double for the SDK's AsyncGenerator-shaped Query return type.
  })() as any;
}

function fakeQueryThrowing(error: unknown) {
  // biome-ignore lint/correctness/useYield: deliberately throws before ever yielding, to simulate the SDK's query() aborting mid-stream.
  return (async function* () {
    throw error;
    // biome-ignore lint/suspicious/noExplicitAny: test double for the SDK's AsyncGenerator-shaped Query return type.
  })() as any;
}

function resultMessage(overrides: Record<string, unknown> = {}) {
  return {
    type: "result",
    subtype: "success",
    total_cost_usd: 0.05,
    is_error: false,
    ...overrides,
  };
}

function assistantToolUse(id: string, name: string, input: unknown) {
  return {
    type: "assistant",
    message: { content: [{ type: "tool_use", id, name, input }] },
  };
}

function userToolResult(toolUseId: string, text: string, isError = false) {
  return {
    type: "user",
    message: {
      content: [
        {
          type: "tool_result",
          tool_use_id: toolUseId,
          content: [{ type: "text", text }],
          is_error: isError,
        },
      ],
    },
  };
}

let root: string;

const passingAdapter = {
  build: async (): Promise<CheckResult> => ({
    name: "typecheck",
    status: "passed",
  }),
  test: async (): Promise<CheckResult> => ({ name: "test", status: "passed" }),
};

const change: ApiChange = {
  id: "response-property-removed:GET:/orders#0",
  severity: "breaking",
  summary: "'totalPrice' was removed from the response",
  target: "GET /orders",
  source: { tool: "oasdiff", id: "response-property-removed", level: 2 },
};

const affected: AffectedLocation[] = [
  {
    file: "src/lib/shipping.ts",
    line: 6,
    changeId: change.id,
    snippet: "return order.totalPrice >= FREE_SHIPPING_THRESHOLD;",
  },
];

beforeEach(async () => {
  root = await mkdtemp(path.join(tmpdir(), "schemend-agent-"));
  await mkdir(path.join(root, "src/lib"), { recursive: true });
  await writeFile(path.join(root, "src/lib/shipping.ts"), "old content");
  mockedQuery.mockReset();
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

function ctx() {
  return { root, exec: async () => ({ exitCode: 0, stdout: "", stderr: "" }) };
}

describe("runFixAgent", () => {
  it("skips the agent when the budget is already exhausted", async () => {
    const budget = new Budget(1);
    budget.record(1);

    const result = await runFixAgent({
      ctx: ctx(),
      adapter: passingAdapter,
      affected,
      changes: [change],
      budget,
      model: "claude-sonnet-5",
      api: "orders",
    });

    expect(mockedQuery).not.toHaveBeenCalled();
    expect(result.review[0]?.reason).toContain("budget");
  });

  it("runs the query, records cost, and reports verified-by-tests on a clean fix", async () => {
    mockedQuery.mockImplementation(() => {
      return fakeQuery([resultMessage({ total_cost_usd: 0.12 })]);
    });
    const budget = new Budget(1);

    const result = await runFixAgent({
      ctx: ctx(),
      adapter: passingAdapter,
      affected,
      changes: [change],
      budget,
      model: "claude-sonnet-5",
      api: "orders",
    });

    expect(mockedQuery).toHaveBeenCalledTimes(1);
    const options = mockedQuery.mock.calls[0]?.[0]?.options;
    expect(options?.tools).toEqual([
      "mcp__schemend__read_file",
      "mcp__schemend__edit_file",
      "mcp__schemend__run_build",
      "mcp__schemend__run_tests",
    ]);
    expect(options?.maxBudgetUsd).toBe(1);
    expect(budget.spent).toBeCloseTo(0.12);
    expect(result.costUsd).toBeCloseTo(0.12);
    expect(result.confidence).toBe("verified-by-tests");
  });

  it("flags budget-exceeded in review without throwing", async () => {
    mockedQuery.mockImplementation(() =>
      fakeQuery([
        resultMessage({ subtype: "error_max_budget_usd", total_cost_usd: 1 }),
      ]),
    );

    const result = await runFixAgent({
      ctx: ctx(),
      adapter: passingAdapter,
      affected,
      changes: [change],
      budget: new Budget(1),
      model: "claude-sonnet-5",
      api: "orders",
    });

    expect(result.review[0]?.reason).toContain("budget exceeded");
    expect(result.costUsd).toBe(1);
  });

  it("reports verified-by-build when tests fail but the build still passes", async () => {
    mockedQuery.mockImplementation(() => fakeQuery([resultMessage()]));
    const adapter = {
      build: passingAdapter.build,
      test: async (): Promise<CheckResult> => ({
        name: "test",
        status: "failed" as const,
      }),
    };

    const result = await runFixAgent({
      ctx: ctx(),
      adapter,
      affected,
      changes: [change],
      budget: new Budget(1),
      model: "claude-sonnet-5",
      api: "orders",
    });

    expect(result.confidence).toBe("verified-by-build");
  });

  it("reports unverified when both build and tests fail after the fix", async () => {
    mockedQuery.mockImplementation(() => fakeQuery([resultMessage()]));
    const adapter = {
      build: async (): Promise<CheckResult> => ({
        name: "typecheck",
        status: "failed" as const,
      }),
      test: async (): Promise<CheckResult> => ({
        name: "test",
        status: "failed" as const,
      }),
    };

    const result = await runFixAgent({
      ctx: ctx(),
      adapter,
      affected,
      changes: [change],
      budget: new Budget(1),
      model: "claude-sonnet-5",
      api: "orders",
    });

    expect(result.confidence).toBe("unverified");
  });

  it("only records changes made to files in the affected list", async () => {
    mockedQuery.mockImplementation(() => fakeQuery([resultMessage()]));

    const result = await runFixAgent({
      ctx: ctx(),
      adapter: passingAdapter,
      affected,
      changes: [change],
      budget: new Budget(1),
      model: "claude-sonnet-5",
      api: "orders",
    });

    expect(result.changedFiles).toEqual([]);
    expect(
      await readFile(path.join(root, "src/lib/shipping.ts"), "utf-8"),
    ).toBe("old content");
  });
});

describe("runFixAgent events", () => {
  it("parses tool_use/tool_result messages into agent-tool-call/-result events correlated by id", async () => {
    mockedQuery.mockImplementation(() =>
      fakeQuery([
        assistantToolUse("tu_1", "mcp__schemend__edit_file", {
          path: "src/lib/shipping.ts",
          content: "new content",
        }),
        userToolResult("tu_1", "wrote src/lib/shipping.ts"),
        resultMessage(),
      ]),
    );
    const events: CheckEvent[] = [];

    await runFixAgent({
      ctx: ctx(),
      adapter: passingAdapter,
      affected,
      changes: [change],
      budget: new Budget(1),
      model: "claude-sonnet-5",
      api: "orders",
      onEvent: (event) => events.push(event),
    });

    expect(
      events.find((event) => event.type === "agent-tool-call"),
    ).toMatchObject({
      type: "agent-tool-call",
      toolUseId: "tu_1",
      tool: "edit_file",
      file: "src/lib/shipping.ts",
    });
    expect(
      events.find((event) => event.type === "agent-tool-result"),
    ).toMatchObject({
      type: "agent-tool-result",
      toolUseId: "tu_1",
      tool: "edit_file",
      status: "success",
      file: "src/lib/shipping.ts",
    });
  });

  it("extracts an error count and first error from a failing run_build tool result", async () => {
    mockedQuery.mockImplementation(() =>
      fakeQuery([
        assistantToolUse("tu_2", "mcp__schemend__run_build", {}),
        userToolResult(
          "tu_2",
          "typecheck: failed\nsrc/a.ts(3,5): error TS2345: bad\nsrc/b.ts(1,1): error TS2345: also bad",
          true,
        ),
        resultMessage(),
      ]),
    );
    const events: CheckEvent[] = [];

    await runFixAgent({
      ctx: ctx(),
      adapter: passingAdapter,
      affected,
      changes: [change],
      budget: new Budget(1),
      model: "claude-sonnet-5",
      api: "orders",
      onEvent: (event) => events.push(event),
    });

    expect(
      events.find((event) => event.type === "agent-tool-result"),
    ).toMatchObject({
      tool: "run_build",
      status: "error",
      errorCount: 2,
      firstError: expect.stringContaining("TS2345"),
    });
  });

  it("emits step/check/cost events around the agent loop, in order", async () => {
    mockedQuery.mockImplementation(() =>
      fakeQuery([resultMessage({ total_cost_usd: 0.12 })]),
    );
    const events: CheckEvent[] = [];

    await runFixAgent({
      ctx: ctx(),
      adapter: passingAdapter,
      affected,
      changes: [change],
      budget: new Budget(1),
      model: "claude-sonnet-5",
      api: "orders",
      onEvent: (event) => events.push(event),
    });

    expect(events.map((event) => event.type)).toEqual([
      "step-started",
      "step-finished",
      "cost-updated",
      "step-started",
      "check-result",
      "check-result",
      "step-finished",
    ]);
    expect(events[0]).toMatchObject({ step: "fix" });
    expect(events[2]).toMatchObject({
      type: "cost-updated",
      spentUsd: expect.closeTo(0.12, 5),
      limitUsd: 1,
    });
    for (const event of events) expect(typeof event.timestamp).toBe("string");
  });

  it("skips cost-updated when the budget was already exhausted (nothing new to report)", async () => {
    const budget = new Budget(1);
    budget.record(1);
    const events: CheckEvent[] = [];

    await runFixAgent({
      ctx: ctx(),
      adapter: passingAdapter,
      affected,
      changes: [change],
      budget,
      model: "claude-sonnet-5",
      api: "orders",
      onEvent: (event) => events.push(event),
    });

    expect(events.map((event) => event.type)).toEqual([
      "step-started",
      "step-finished",
    ]);
    expect(events[1]).toMatchObject({
      step: "fix",
      status: "failed",
      reason: "budget-exceeded",
    });
  });
});

describe("runFixAgent cancellation", () => {
  it("returns unverified immediately when the abortController is already aborted", async () => {
    const abortController = new AbortController();
    abortController.abort();
    const events: CheckEvent[] = [];

    const result = await runFixAgent({
      ctx: ctx(),
      adapter: passingAdapter,
      affected,
      changes: [change],
      budget: new Budget(1),
      model: "claude-sonnet-5",
      api: "orders",
      abortController,
      onEvent: (event) => events.push(event),
    });

    expect(mockedQuery).not.toHaveBeenCalled();
    expect(result.confidence).toBe("unverified");
    expect(result.review[0]?.reason).toContain("cancelled");
    expect(events.map((event) => event.type)).toEqual([
      "step-started",
      "step-finished",
    ]);
    expect(events[1]).toMatchObject({
      step: "fix",
      status: "failed",
      reason: "cancelled",
    });
  });

  it("treats an AbortError from the SDK as a clean stop and skips verify", async () => {
    mockedQuery.mockImplementation(() => fakeQueryThrowing(new AbortError()));
    const build = vi.fn(passingAdapter.build);
    const test = vi.fn(passingAdapter.test);
    const events: CheckEvent[] = [];

    const result = await runFixAgent({
      ctx: ctx(),
      adapter: { build, test },
      affected,
      changes: [change],
      budget: new Budget(1),
      model: "claude-sonnet-5",
      api: "orders",
      abortController: new AbortController(),
      onEvent: (event) => events.push(event),
    });

    expect(build).not.toHaveBeenCalled();
    expect(test).not.toHaveBeenCalled();
    expect(result.confidence).toBe("unverified");
    expect(result.checks).toEqual([]);
    expect(result.review[0]?.reason).toContain("cancelled");
    expect(events.map((event) => event.type)).toEqual([
      "step-started",
      "step-finished",
    ]);
    expect(events[1]).toMatchObject({
      step: "fix",
      status: "failed",
      reason: "cancelled",
    });
  });

  it("rethrows a non-abort error from the SDK", async () => {
    mockedQuery.mockImplementation(() => fakeQueryThrowing(new Error("boom")));

    await expect(
      runFixAgent({
        ctx: ctx(),
        adapter: passingAdapter,
        affected,
        changes: [change],
        budget: new Budget(1),
        model: "claude-sonnet-5",
        api: "orders",
      }),
    ).rejects.toThrow("boom");
  });
});
