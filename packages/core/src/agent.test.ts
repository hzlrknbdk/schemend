import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { AbortError, query } from "@anthropic-ai/claude-agent-sdk";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { finalizeReview, MissingApiKeyError, runFixAgent } from "./agent.js";
import { buildAgentTools } from "./agent-tools.js";
import { Budget } from "./budget.js";
import type { CheckEvent } from "./events.js";
import type {
  AffectedLocation,
  ApiChange,
  ApiEntry,
  CheckResult,
  ReviewItem,
} from "./types.js";

vi.mock("@anthropic-ai/claude-agent-sdk", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@anthropic-ai/claude-agent-sdk")>();
  return { ...actual, query: vi.fn() };
});

const agentToolsMock = vi.hoisted(() => ({
  real: undefined as
    | typeof import("./agent-tools.js")["buildAgentTools"]
    | undefined,
}));

vi.mock("./agent-tools.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./agent-tools.js")>();
  agentToolsMock.real = actual.buildAgentTools;
  return { ...actual, buildAgentTools: vi.fn(actual.buildAgentTools) };
});

const mockedQuery = vi.mocked(query);
const mockedBuildAgentTools = vi.mocked(buildAgentTools);

/**
 * Makes the next buildAgentTools call return real server/tools/changedFiles but with `flags`
 * pre-populated - simulates "the agent already called flag mid-session" without needing the fake
 * SDK message stream to actually dispatch a real MCP tool call (it never does; see the
 * tool_use/tool_result tests below, which only exercise event parsing).
 */
function mockPendingFlags(flags: ReviewItem[]) {
  mockedBuildAgentTools.mockImplementationOnce((...args) => {
    const real = agentToolsMock.real;
    if (!real) throw new Error("agent-tools.js mock not initialized");
    const result = real(...args);
    result.flags.push(...flags);
    return result;
  });
}

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
let originalApiKey: string | undefined;

const passingAdapter = {
  build: async (): Promise<CheckResult> => ({
    name: "typecheck",
    status: "passed",
  }),
  test: async (): Promise<CheckResult> => ({ name: "test", status: "passed" }),
  findAffected: async (): Promise<AffectedLocation[]> => [],
};

const apiEntry: ApiEntry = {
  name: "orders",
  kind: "internal",
  source: { type: "openapi", location: "../../services/orders/openapi.json" },
  usedIn: ["src/lib"],
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
  mockedBuildAgentTools.mockClear();
  // Every test gets a deterministic fake key, regardless of the host shell's own
  // ANTHROPIC_API_KEY - the "missing key" test below unsets it for itself and restores it in its
  // own afterEach-equivalent cleanup.
  originalApiKey = process.env.ANTHROPIC_API_KEY;
  process.env.ANTHROPIC_API_KEY = "sk-ant-test-key";
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
  if (originalApiKey === undefined) delete process.env.ANTHROPIC_API_KEY;
  else process.env.ANTHROPIC_API_KEY = originalApiKey;
});

function ctx() {
  return { root, exec: async () => ({ exitCode: 0, stdout: "", stderr: "" }) };
}

describe("finalizeReview", () => {
  it("concatenates review and flags, flags last", () => {
    const review: ReviewItem[] = [
      { file: "a.ts", reason: "orchestrator reason" },
    ];
    const flags: ReviewItem[] = [
      { file: "b.ts", reason: "agent reason", source: "agent-flag" },
    ];

    expect(finalizeReview(review, flags)).toEqual([...review, ...flags]);
  });

  it("dedupes an identical file+reason pair regardless of which list it came from", () => {
    const review: ReviewItem[] = [{ file: "a.ts", reason: "same concern" }];
    const flags: ReviewItem[] = [
      { file: "a.ts", reason: "same concern", source: "agent-flag" },
    ];

    // The first occurrence wins, so the orchestrator's plain item (no `source`) is kept.
    expect(finalizeReview(review, flags)).toEqual([
      { file: "a.ts", reason: "same concern" },
    ]);
  });

  it("keeps two flags for the same file with different reasons", () => {
    const flags: ReviewItem[] = [
      { file: "a.ts", reason: "concern one", source: "agent-flag" },
      { file: "a.ts", reason: "concern two", source: "agent-flag" },
    ];

    expect(finalizeReview([], flags)).toEqual(flags);
  });

  it("returns an empty array when both inputs are empty", () => {
    expect(finalizeReview([], [])).toEqual([]);
  });
});

describe("runFixAgent", () => {
  it("skips the agent when the budget is already exhausted", async () => {
    const budget = new Budget(1);
    budget.record(1);

    const result = await runFixAgent({
      ctx: ctx(),
      adapter: passingAdapter,
      apiEntry,
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
      apiEntry,
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
      "mcp__schemend__flag",
    ]);
    expect(options?.maxBudgetUsd).toBe(1);
    expect(budget.spent).toBeCloseTo(0.12);
    expect(result.costUsd).toBeCloseTo(0.12);
    expect(result.confidence).toBe("verified-by-tests");
  });

  it("tells the model the allowed-files list can grow, in both prompts", async () => {
    mockedQuery.mockImplementation(() =>
      fakeQuery([resultMessage({ total_cost_usd: 0.01 })]),
    );

    await runFixAgent({
      ctx: ctx(),
      adapter: passingAdapter,
      apiEntry,
      affected,
      changes: [change],
      budget: new Budget(1),
      model: "claude-sonnet-5",
      api: "orders",
    });

    const options = mockedQuery.mock.calls[0]?.[0]?.options;
    // Regression guard for a real bug: an earlier wording ("fix ONLY the files listed above -
    // do not touch any other file") was taken literally by a real model even once run_build's
    // on-failure expansion (agent-tools.ts) had genuinely unlocked a new file - the model never
    // tried, because nothing told it the list could grow. Both prompts must say so now.
    expect(options?.systemPrompt).toMatch(/can grow/);
    expect(mockedQuery.mock.calls[0]?.[0]?.prompt).toMatch(
      /list of editable files can grow/,
    );
  });

  it("tells the model about the flag tool and that it isn't a substitute for fixing, in both prompts", async () => {
    mockedQuery.mockImplementation(() =>
      fakeQuery([resultMessage({ total_cost_usd: 0.01 })]),
    );

    await runFixAgent({
      ctx: ctx(),
      adapter: passingAdapter,
      apiEntry,
      affected,
      changes: [change],
      budget: new Budget(1),
      model: "claude-sonnet-5",
      api: "orders",
    });

    const options = mockedQuery.mock.calls[0]?.[0]?.options;
    expect(options?.systemPrompt).toMatch(/flag/);
    expect(options?.systemPrompt).toMatch(/not a substitute for fixing/);
    expect(mockedQuery.mock.calls[0]?.[0]?.prompt).toMatch(/call flag/);
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
      apiEntry,
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
      findAffected: passingAdapter.findAffected,
    };

    const result = await runFixAgent({
      ctx: ctx(),
      adapter,
      apiEntry,
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
      findAffected: passingAdapter.findAffected,
    };

    const result = await runFixAgent({
      ctx: ctx(),
      adapter,
      apiEntry,
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
      apiEntry,
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
      apiEntry,
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

  it("extracts checkStatus + error count + first error from a failing run_build tool result", async () => {
    // is_error stays false: run_build's own tool call succeeded (it always returns a normal
    // result, even for a failed build - see agent-tools.ts). The build-failed/errorCount/
    // firstError signal rides in the text itself, via formatCheck's `[[schemend:summary]]`
    // trailer (the adapter's own parsing already happened before this text was built).
    mockedQuery.mockImplementation(() =>
      fakeQuery([
        assistantToolUse("tu_2", "mcp__schemend__run_build", {}),
        userToolResult(
          "tu_2",
          "typecheck: failed\nsrc/a.ts(3,5): error TS2345: bad\nsrc/b.ts(1,1): error TS2345: also bad\n\n" +
            '[[schemend:summary]]{"errorCount":2,"firstError":"error TS2345: bad"}',
          false,
        ),
        resultMessage(),
      ]),
    );
    const events: CheckEvent[] = [];

    await runFixAgent({
      ctx: ctx(),
      adapter: passingAdapter,
      apiEntry,
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
      status: "success",
      checkStatus: "failed",
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
      apiEntry,
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
      apiEntry,
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
      apiEntry,
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
      adapter: { build, test, findAffected: passingAdapter.findAffected },
      apiEntry,
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
        apiEntry,
        affected,
        changes: [change],
        budget: new Budget(1),
        model: "claude-sonnet-5",
        api: "orders",
      }),
    ).rejects.toThrow("boom");
  });
});

describe("runFixAgent missing API key", () => {
  it("throws MissingApiKeyError and never calls the SDK when ANTHROPIC_API_KEY is unset", async () => {
    delete process.env.ANTHROPIC_API_KEY;
    const events: CheckEvent[] = [];

    await expect(
      runFixAgent({
        ctx: ctx(),
        adapter: passingAdapter,
        apiEntry,
        affected,
        changes: [change],
        budget: new Budget(1),
        model: "claude-sonnet-5",
        api: "orders",
        onEvent: (event) => events.push(event),
      }),
    ).rejects.toThrow(MissingApiKeyError);

    expect(mockedQuery).not.toHaveBeenCalled();
    expect(events.map((event) => event.type)).toEqual([
      "step-started",
      "step-finished",
    ]);
    expect(events[1]).toMatchObject({
      step: "fix",
      status: "failed",
      reason: "missing-api-key",
    });
  });

  it("throws MissingApiKeyError when ANTHROPIC_API_KEY is set but blank", async () => {
    process.env.ANTHROPIC_API_KEY = "   ";

    await expect(
      runFixAgent({
        ctx: ctx(),
        adapter: passingAdapter,
        apiEntry,
        affected,
        changes: [change],
        budget: new Budget(1),
        model: "claude-sonnet-5",
        api: "orders",
      }),
    ).rejects.toThrow(MissingApiKeyError);
    expect(mockedQuery).not.toHaveBeenCalled();
  });

  it("passes the validated key through to the SDK's own env, not bare inheritance", async () => {
    process.env.ANTHROPIC_API_KEY = "sk-ant-real-key";
    mockedQuery.mockImplementation(() => fakeQuery([resultMessage()]));

    await runFixAgent({
      ctx: ctx(),
      adapter: passingAdapter,
      apiEntry,
      affected,
      changes: [change],
      budget: new Budget(1),
      model: "claude-sonnet-5",
      api: "orders",
    });

    const options = mockedQuery.mock.calls[0]?.[0]?.options;
    expect(options?.env?.ANTHROPIC_API_KEY).toBe("sk-ant-real-key");
  });

  it("does not leak an ambient CLAUDE_CODE_* var into the SDK's subprocess env", async () => {
    process.env.ANTHROPIC_API_KEY = "sk-ant-real-key";
    process.env.CLAUDE_CODE_SSE_PORT = "12345";
    mockedQuery.mockImplementation(() => fakeQuery([resultMessage()]));

    try {
      await runFixAgent({
        ctx: ctx(),
        adapter: passingAdapter,
        apiEntry,
        affected,
        changes: [change],
        budget: new Budget(1),
        model: "claude-sonnet-5",
        api: "orders",
      });

      const options = mockedQuery.mock.calls[0]?.[0]?.options;
      expect(options?.env).not.toHaveProperty("CLAUDE_CODE_SSE_PORT");
    } finally {
      delete process.env.CLAUDE_CODE_SSE_PORT;
    }
  });

  it("parses the SDK's system/init message into an agent-session-started event carrying apiKeySource", async () => {
    mockedQuery.mockImplementation(() =>
      fakeQuery([
        {
          type: "system",
          subtype: "init",
          apiKeySource: "ANTHROPIC_API_KEY",
        },
        resultMessage(),
      ]),
    );
    const events: CheckEvent[] = [];

    await runFixAgent({
      ctx: ctx(),
      adapter: passingAdapter,
      apiEntry,
      affected,
      changes: [change],
      budget: new Budget(1),
      model: "claude-sonnet-5",
      api: "orders",
      onEvent: (event) => events.push(event),
    });

    expect(
      events.find((event) => event.type === "agent-session-started"),
    ).toMatchObject({
      type: "agent-session-started",
      api: "orders",
      apiKeySource: "ANTHROPIC_API_KEY",
    });
  });
});

describe("runFixAgent flag tool", () => {
  it("parses a flag tool_use/tool_result pair into agent-tool-call/-result events with file and reason", async () => {
    mockedQuery.mockImplementation(() =>
      fakeQuery([
        assistantToolUse("tu_3", "mcp__schemend__flag", {
          file: "src/receipt-formatter.ts",
          reason: "hardcoded TL currency suffix",
        }),
        userToolResult(
          "tu_3",
          "flagged src/receipt-formatter.ts: hardcoded TL currency suffix",
        ),
        resultMessage(),
      ]),
    );
    const events: CheckEvent[] = [];

    await runFixAgent({
      ctx: ctx(),
      adapter: passingAdapter,
      apiEntry,
      affected,
      changes: [change],
      budget: new Budget(1),
      model: "claude-sonnet-5",
      api: "orders",
      onEvent: (event) => events.push(event),
    });

    expect(
      events.find(
        (event) => event.type === "agent-tool-call" && event.tool === "flag",
      ),
    ).toMatchObject({
      type: "agent-tool-call",
      tool: "flag",
      toolUseId: "tu_3",
      file: "src/receipt-formatter.ts",
      reason: "hardcoded TL currency suffix",
    });
    expect(
      events.find(
        (event) => event.type === "agent-tool-result" && event.tool === "flag",
      ),
    ).toMatchObject({
      type: "agent-tool-result",
      tool: "flag",
      toolUseId: "tu_3",
      status: "success",
      file: "src/receipt-formatter.ts",
    });
  });

  it("merges a flag reported during the session into the final review on a clean fix", async () => {
    mockPendingFlags([
      {
        file: "src/receipt-formatter.ts",
        reason: "hardcoded TL currency suffix",
        source: "agent-flag",
      },
    ]);
    mockedQuery.mockImplementation(() =>
      fakeQuery([resultMessage({ total_cost_usd: 0.05 })]),
    );

    const result = await runFixAgent({
      ctx: ctx(),
      adapter: passingAdapter,
      apiEntry,
      affected,
      changes: [change],
      budget: new Budget(1),
      model: "claude-sonnet-5",
      api: "orders",
    });

    expect(result.confidence).toBe("verified-by-tests");
    expect(result.review).toEqual([
      {
        file: "src/receipt-formatter.ts",
        reason: "hardcoded TL currency suffix",
        source: "agent-flag",
      },
    ]);
  });

  it("dedupes a flag reported more than once with the same file and reason", async () => {
    mockPendingFlags([
      { file: "a.ts", reason: "same concern", source: "agent-flag" },
      { file: "a.ts", reason: "same concern", source: "agent-flag" },
    ]);
    mockedQuery.mockImplementation(() => fakeQuery([resultMessage()]));

    const result = await runFixAgent({
      ctx: ctx(),
      adapter: passingAdapter,
      apiEntry,
      affected,
      changes: [change],
      budget: new Budget(1),
      model: "claude-sonnet-5",
      api: "orders",
    });

    expect(result.review).toEqual([
      { file: "a.ts", reason: "same concern", source: "agent-flag" },
    ]);
  });

  it("keeps a flag reported before a mid-session AbortError", async () => {
    mockPendingFlags([
      { file: "a.ts", reason: "concern before abort", source: "agent-flag" },
    ]);
    mockedQuery.mockImplementation(() => fakeQueryThrowing(new AbortError()));

    const result = await runFixAgent({
      ctx: ctx(),
      adapter: passingAdapter,
      apiEntry,
      affected,
      changes: [change],
      budget: new Budget(1),
      model: "claude-sonnet-5",
      api: "orders",
      abortController: new AbortController(),
    });

    expect(result.confidence).toBe("unverified");
    expect(result.review).toEqual(
      expect.arrayContaining([
        { file: "a.ts", reason: "concern before abort", source: "agent-flag" },
      ]),
    );
  });

  it("keeps a flag reported before budget was exceeded mid-session", async () => {
    mockPendingFlags([
      {
        file: "a.ts",
        reason: "concern before budget ran out",
        source: "agent-flag",
      },
    ]);
    mockedQuery.mockImplementation(() =>
      fakeQuery([
        resultMessage({ subtype: "error_max_budget_usd", total_cost_usd: 1 }),
      ]),
    );

    const result = await runFixAgent({
      ctx: ctx(),
      adapter: passingAdapter,
      apiEntry,
      affected,
      changes: [change],
      budget: new Budget(1),
      model: "claude-sonnet-5",
      api: "orders",
    });

    expect(result.review).toEqual(
      expect.arrayContaining([
        {
          file: "a.ts",
          reason: "concern before budget ran out",
          source: "agent-flag",
        },
      ]),
    );
  });
});
