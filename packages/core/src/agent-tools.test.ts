import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  buildAgentTools,
  qualifiedToolName,
  TOOL_NAMES,
} from "./agent-tools.js";
import type { CheckEvent } from "./events.js";
import type {
  AffectedLocation,
  ApiChange,
  ApiEntry,
  CheckResult,
} from "./types.js";

let root: string;

const stubAdapter = {
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

function findTool(
  tools: ReturnType<typeof buildAgentTools>["tools"],
  name: string,
) {
  const found = tools.find((t) => t.name === name);
  if (!found) throw new Error(`tool not found: ${name}`);
  return found;
}

beforeEach(async () => {
  root = await mkdtemp(path.join(tmpdir(), "schemend-agent-tools-"));
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

describe("qualifiedToolName", () => {
  it("prefixes every tool name with the mcp wire format", () => {
    expect(qualifiedToolName("read_file")).toBe("mcp__schemend__read_file");
    expect(TOOL_NAMES.map(qualifiedToolName)).toEqual([
      "mcp__schemend__read_file",
      "mcp__schemend__edit_file",
      "mcp__schemend__run_build",
      "mcp__schemend__run_tests",
      "mcp__schemend__flag",
    ]);
  });
});

describe("read_file", () => {
  it("returns the file's contents", async () => {
    await mkdir(path.join(root, "src"), { recursive: true });
    await writeFile(path.join(root, "src/a.ts"), "hello");
    const { tools } = buildAgentTools(
      { root, exec: async () => ({ exitCode: 0, stdout: "", stderr: "" }) },
      stubAdapter,
      ["src/a.ts"],
      apiEntry,
      [change],
    );

    const result = await findTool(tools, "read_file").handler(
      { path: "src/a.ts" },
      undefined,
    );

    expect(result.isError).toBeFalsy();
    expect(result.content).toEqual([{ type: "text", text: "hello" }]);
  });

  it("reports an error for a missing file instead of throwing", async () => {
    const { tools } = buildAgentTools(
      { root, exec: async () => ({ exitCode: 0, stdout: "", stderr: "" }) },
      stubAdapter,
      [],
      apiEntry,
      [change],
    );

    const result = await findTool(tools, "read_file").handler(
      { path: "nope.ts" },
      undefined,
    );

    expect(result.isError).toBe(true);
  });
});

describe("edit_file", () => {
  it("writes the file and records it as changed when the path is affected", async () => {
    await mkdir(path.join(root, "src"), { recursive: true });
    await writeFile(path.join(root, "src/a.ts"), "old");
    const { tools, changedFiles } = buildAgentTools(
      { root, exec: async () => ({ exitCode: 0, stdout: "", stderr: "" }) },
      stubAdapter,
      ["src/a.ts"],
      apiEntry,
      [change],
    );

    const result = await findTool(tools, "edit_file").handler(
      { path: "src/a.ts", content: "new" },
      undefined,
    );

    expect(result.isError).toBeFalsy();
    expect(changedFiles).toEqual(new Set(["src/a.ts"]));
    expect(await readFile(path.join(root, "src/a.ts"), "utf-8")).toBe("new");
  });

  it("emits a file-edited event with the diff when onEvent is passed in", async () => {
    await mkdir(path.join(root, "src"), { recursive: true });
    await writeFile(path.join(root, "src/a.ts"), "line1\nline2\n");
    const events: CheckEvent[] = [];
    const { tools } = buildAgentTools(
      { root, exec: async () => ({ exitCode: 0, stdout: "", stderr: "" }) },
      stubAdapter,
      ["src/a.ts"],
      apiEntry,
      [change],
      (event) => events.push(event),
    );

    await findTool(tools, "edit_file").handler(
      { path: "src/a.ts", content: "line1\nline2 changed\n" },
      undefined,
    );

    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      type: "file-edited",
      api: "orders",
      file: "src/a.ts",
      added: 1,
      removed: 1,
    });
    const diff = events[0]?.type === "file-edited" ? events[0].diff : undefined;
    expect(diff).toContain("-line2");
    expect(diff).toContain("+line2 changed");
  });

  it("does not emit a file-edited event when the new content is identical", async () => {
    await mkdir(path.join(root, "src"), { recursive: true });
    await writeFile(path.join(root, "src/a.ts"), "same");
    const events: CheckEvent[] = [];
    const { tools } = buildAgentTools(
      { root, exec: async () => ({ exitCode: 0, stdout: "", stderr: "" }) },
      stubAdapter,
      ["src/a.ts"],
      apiEntry,
      [change],
      (event) => events.push(event),
    );

    await findTool(tools, "edit_file").handler(
      { path: "src/a.ts", content: "same" },
      undefined,
    );

    expect(events).toEqual([]);
  });

  it("refuses to write a file that isn't in the affected list", async () => {
    await mkdir(path.join(root, "src"), { recursive: true });
    await writeFile(path.join(root, "src/other.ts"), "untouched");
    const { tools, changedFiles } = buildAgentTools(
      { root, exec: async () => ({ exitCode: 0, stdout: "", stderr: "" }) },
      stubAdapter,
      ["src/a.ts"],
      apiEntry,
      [change],
    );

    const result = await findTool(tools, "edit_file").handler(
      { path: "src/other.ts", content: "hacked" },
      undefined,
    );

    expect(result.isError).toBe(true);
    expect(changedFiles.size).toBe(0);
    expect(await readFile(path.join(root, "src/other.ts"), "utf-8")).toBe(
      "untouched",
    );
  });

  it("allows writing a file that run_build newly reported as affected", async () => {
    await mkdir(path.join(root, "src"), { recursive: true });
    await writeFile(path.join(root, "src/newly-affected.ts"), "old");
    const newlyAffected: AffectedLocation[] = [
      {
        file: "src/newly-affected.ts",
        line: 1,
        changeId: change.id,
        snippet: "order.totalPrice",
      },
    ];
    const adapter = {
      build: async (): Promise<CheckResult> => ({
        name: "typecheck",
        status: "failed" as const,
      }),
      test: stubAdapter.test,
      findAffected: async (): Promise<AffectedLocation[]> => newlyAffected,
    };
    const { tools } = buildAgentTools(
      { root, exec: async () => ({ exitCode: 0, stdout: "", stderr: "" }) },
      adapter,
      [],
      apiEntry,
      [change],
    );

    await findTool(tools, "run_build").handler({}, undefined);
    const result = await findTool(tools, "edit_file").handler(
      { path: "src/newly-affected.ts", content: "new" },
      undefined,
    );

    expect(result.isError).toBeFalsy();
    expect(
      await readFile(path.join(root, "src/newly-affected.ts"), "utf-8"),
    ).toBe("new");
  });
});

describe("run_build / run_tests", () => {
  it("run_build calls adapter.build and reports a passed result", async () => {
    const { tools } = buildAgentTools(
      { root, exec: async () => ({ exitCode: 0, stdout: "", stderr: "" }) },
      stubAdapter,
      [],
      apiEntry,
      [change],
    );

    const result = await findTool(tools, "run_build").handler({}, undefined);

    expect(result.content).toEqual([
      { type: "text", text: "typecheck: passed" },
    ]);
  });

  it("does not call findAffected when the build passes", async () => {
    let findAffectedCalls = 0;
    const adapter = {
      build: stubAdapter.build,
      test: stubAdapter.test,
      findAffected: async (): Promise<AffectedLocation[]> => {
        findAffectedCalls += 1;
        return [];
      },
    };
    const { tools } = buildAgentTools(
      { root, exec: async () => ({ exitCode: 0, stdout: "", stderr: "" }) },
      adapter,
      [],
      apiEntry,
      [change],
    );

    await findTool(tools, "run_build").handler({}, undefined);

    expect(findAffectedCalls).toBe(0);
  });

  it("ignores a newly-affected path findAffected reports outside the project root", async () => {
    const adapter = {
      build: async (): Promise<CheckResult> => ({
        name: "typecheck",
        status: "failed" as const,
      }),
      test: stubAdapter.test,
      findAffected: async (): Promise<AffectedLocation[]> => [
        {
          file: "../outside.ts",
          line: 1,
          changeId: change.id,
          snippet: "",
        },
      ],
    };
    const { tools } = buildAgentTools(
      { root, exec: async () => ({ exitCode: 0, stdout: "", stderr: "" }) },
      adapter,
      [],
      apiEntry,
      [change],
    );

    await findTool(tools, "run_build").handler({}, undefined);
    const result = await findTool(tools, "edit_file").handler(
      { path: "../outside.ts", content: "hacked" },
      undefined,
    );

    expect(result.isError).toBe(true);
  });

  it("run_tests surfaces a failing adapter.test result with its detail", async () => {
    const failingAdapter = {
      build: stubAdapter.build,
      test: async (): Promise<CheckResult> => ({
        name: "test",
        status: "failed",
        detail: "1 failing",
      }),
      findAffected: stubAdapter.findAffected,
    };
    const { tools } = buildAgentTools(
      { root, exec: async () => ({ exitCode: 0, stdout: "", stderr: "" }) },
      failingAdapter,
      [],
      apiEntry,
      [change],
    );

    const result = await findTool(tools, "run_tests").handler({}, undefined);
    const block = result.content[0];
    const text = block?.type === "text" ? block.text : undefined;

    expect(text).toContain("test: failed");
    expect(text).toContain("1 failing");
  });

  it("tells the model which newly-affected files it may now also edit", async () => {
    const adapter = {
      build: async (): Promise<CheckResult> => ({
        name: "typecheck",
        status: "failed" as const,
      }),
      test: stubAdapter.test,
      findAffected: async (): Promise<AffectedLocation[]> => [
        {
          file: "src/newly-affected.ts",
          line: 1,
          changeId: change.id,
          snippet: "order.totalPrice",
        },
      ],
    };
    const { tools } = buildAgentTools(
      { root, exec: async () => ({ exitCode: 0, stdout: "", stderr: "" }) },
      adapter,
      [],
      apiEntry,
      [change],
    );

    const result = await findTool(tools, "run_build").handler({}, undefined);
    const block = result.content[0];
    const text = block?.type === "text" ? block.text : undefined;

    expect(text).toContain("You may now also edit: src/newly-affected.ts");
  });

  it("says nothing about newly-allowed files when findAffected reports nothing new", async () => {
    const { tools } = buildAgentTools(
      { root, exec: async () => ({ exitCode: 0, stdout: "", stderr: "" }) },
      {
        build: async (): Promise<CheckResult> => ({
          name: "typecheck",
          status: "failed" as const,
        }),
        test: stubAdapter.test,
        findAffected: stubAdapter.findAffected,
      },
      [],
      apiEntry,
      [change],
    );

    const result = await findTool(tools, "run_build").handler({}, undefined);
    const block = result.content[0];
    const text = block?.type === "text" ? block.text : undefined;

    expect(text).not.toContain("You may now also edit");
  });

  it("embeds the adapter's build-failure summary as a machine-readable trailer", async () => {
    const adapter = {
      build: async (): Promise<CheckResult> => ({
        name: "typecheck",
        status: "failed" as const,
        detail: "src/a.ts(1,1): error TS2339: bad",
      }),
      test: stubAdapter.test,
      findAffected: stubAdapter.findAffected,
      summarizeBuildFailure: () => ({
        errorCount: 1,
        firstError: "TS2339: bad",
      }),
    };
    const { tools } = buildAgentTools(
      { root, exec: async () => ({ exitCode: 0, stdout: "", stderr: "" }) },
      adapter,
      [],
      apiEntry,
      [change],
    );

    const result = await findTool(tools, "run_build").handler({}, undefined);
    const block = result.content[0];
    const text = block?.type === "text" ? block.text : undefined;

    expect(text).toContain(
      '[[schemend:summary]]{"errorCount":1,"firstError":"TS2339: bad"}',
    );
  });

  it("embeds the adapter's test-result summary as a machine-readable trailer", async () => {
    const adapter = {
      build: stubAdapter.build,
      test: async (): Promise<CheckResult> => ({
        name: "test",
        status: "failed" as const,
        detail: "1 failing",
      }),
      findAffected: stubAdapter.findAffected,
      summarizeTestResult: () => ({
        passed: 9,
        failed: 1,
        firstFailure: "shipping.test.ts > applies free shipping",
      }),
    };
    const { tools } = buildAgentTools(
      { root, exec: async () => ({ exitCode: 0, stdout: "", stderr: "" }) },
      adapter,
      [],
      apiEntry,
      [change],
    );

    const result = await findTool(tools, "run_tests").handler({}, undefined);
    const block = result.content[0];
    const text = block?.type === "text" ? block.text : undefined;

    expect(text).toContain(
      '[[schemend:summary]]{"passed":9,"failed":1,"firstFailure":"shipping.test.ts > applies free shipping"}',
    );
  });
});

describe("flag", () => {
  it("records a behavioral concern with its source, even for a file outside the affected list", async () => {
    await mkdir(path.join(root, "src"), { recursive: true });
    await writeFile(path.join(root, "src/receipt-formatter.ts"), "x");
    const { tools, flags } = buildAgentTools(
      { root, exec: async () => ({ exitCode: 0, stdout: "", stderr: "" }) },
      stubAdapter,
      [],
      apiEntry,
      [change],
    );

    const result = await findTool(tools, "flag").handler(
      {
        file: "src/receipt-formatter.ts",
        reason:
          "hardcoded TL currency suffix, not covered by this schema change",
      },
      undefined,
    );

    expect(result.isError).toBeFalsy();
    expect(flags).toEqual([
      {
        file: "src/receipt-formatter.ts",
        reason:
          "hardcoded TL currency suffix, not covered by this schema change",
        source: "agent-flag",
      },
    ]);
  });

  it("trims the reason before storing it", async () => {
    await writeFile(path.join(root, "a.ts"), "x");
    const { tools, flags } = buildAgentTools(
      { root, exec: async () => ({ exitCode: 0, stdout: "", stderr: "" }) },
      stubAdapter,
      [],
      apiEntry,
      [change],
    );

    await findTool(tools, "flag").handler(
      { file: "a.ts", reason: "  needs a human look  " },
      undefined,
    );

    expect(flags).toEqual([
      { file: "a.ts", reason: "needs a human look", source: "agent-flag" },
    ]);
  });

  it("refuses an empty reason", async () => {
    await writeFile(path.join(root, "a.ts"), "x");
    const { tools, flags } = buildAgentTools(
      { root, exec: async () => ({ exitCode: 0, stdout: "", stderr: "" }) },
      stubAdapter,
      [],
      apiEntry,
      [change],
    );

    const result = await findTool(tools, "flag").handler(
      { file: "a.ts", reason: "   " },
      undefined,
    );

    expect(result.isError).toBe(true);
    expect(flags).toEqual([]);
  });

  it("refuses a file outside the consumer project", async () => {
    const { tools, flags } = buildAgentTools(
      { root, exec: async () => ({ exitCode: 0, stdout: "", stderr: "" }) },
      stubAdapter,
      [],
      apiEntry,
      [change],
    );

    const result = await findTool(tools, "flag").handler(
      { file: "../outside.ts", reason: "escape attempt" },
      undefined,
    );

    expect(result.isError).toBe(true);
    expect(flags).toEqual([]);
  });

  it("refuses a file that does not exist", async () => {
    const { tools, flags } = buildAgentTools(
      { root, exec: async () => ({ exitCode: 0, stdout: "", stderr: "" }) },
      stubAdapter,
      [],
      apiEntry,
      [change],
    );

    const result = await findTool(tools, "flag").handler(
      { file: "nope.ts", reason: "ghost file" },
      undefined,
    );

    expect(result.isError).toBe(true);
    expect(flags).toEqual([]);
  });
});
