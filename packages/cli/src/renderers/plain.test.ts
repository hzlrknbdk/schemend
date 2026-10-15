import type {
  AffectedLocation,
  ApiChange,
  CheckEvent,
  ServiceResult,
} from "@schemend/core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createPlainRenderer } from "./plain.js";

const timestamp = "2026-01-01T00:00:00.000Z";

const breakingChange: ApiChange = {
  id: "response-property-removed:GET:/orders#0",
  severity: "breaking",
  summary: "'totalPrice' was removed from the response",
  target: "GET /orders",
  source: { tool: "oasdiff", id: "response-property-removed", level: 2 },
};

const nonBreakingChange: ApiChange = {
  ...breakingChange,
  id: "response-property-added:GET:/orders#0",
  severity: "non-breaking",
};

const affected: AffectedLocation = {
  file: "src/lib/shipping.ts",
  line: 6,
  changeId: breakingChange.id,
  snippet: "return order.totalPrice >= FREE_SHIPPING_THRESHOLD;",
};

function logLines(): string[] {
  return vi.mocked(console.log).mock.calls.map((call) => String(call[0]));
}

beforeEach(() => {
  vi.spyOn(console, "log").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("createPlainRenderer", () => {
  it.each<[string, CheckEvent, string[]]>([
    [
      "run-started",
      {
        type: "run-started",
        timestamp,
        eventSchemaVersion: 1,
        apis: ["orders"],
        budgetUsd: 1,
      },
      ["schemend check: orders (budget $1.00)"],
    ],
    [
      "step-started",
      { type: "step-started", timestamp, api: "orders", step: "baseline" },
      ["orders: baseline..."],
    ],
    [
      "step-finished (passed)",
      {
        type: "step-finished",
        timestamp,
        api: "orders",
        step: "baseline",
        durationMs: 120,
        status: "passed",
      },
      ["orders: baseline passed [120ms]"],
    ],
    [
      "step-finished (failed, with reason)",
      {
        type: "step-finished",
        timestamp,
        api: "orders",
        step: "baseline",
        durationMs: 50,
        status: "failed",
        reason: "baseline-failed",
      },
      ["orders: baseline failed [50ms] (baseline-failed)"],
    ],
    [
      "changes-detected",
      {
        type: "changes-detected",
        timestamp,
        api: "orders",
        changes: [breakingChange, nonBreakingChange],
      },
      ["orders: 2 change(s) found (1 breaking)"],
    ],
    [
      "affected-found",
      {
        type: "affected-found",
        timestamp,
        api: "orders",
        affected: [affected],
      },
      ["orders: 1 location(s) affected"],
    ],
    [
      "agent-tool-call (read_file)",
      {
        type: "agent-tool-call",
        timestamp,
        api: "orders",
        toolUseId: "tu_1",
        tool: "read_file",
        file: "src/a.ts",
      },
      ["orders: agent -> read_file src/a.ts"],
    ],
    [
      "agent-tool-call (run_build)",
      {
        type: "agent-tool-call",
        timestamp,
        api: "orders",
        toolUseId: "tu_2",
        tool: "run_build",
      },
      ["orders: agent -> run_build"],
    ],
    [
      "agent-tool-result (edit_file)",
      {
        type: "agent-tool-result",
        timestamp,
        api: "orders",
        toolUseId: "tu_1",
        tool: "edit_file",
        status: "success",
        file: "src/a.ts",
      },
      ["orders: agent <- edit_file src/a.ts (success)"],
    ],
    [
      "agent-tool-result (run_build, with error detail)",
      {
        type: "agent-tool-result",
        timestamp,
        api: "orders",
        toolUseId: "tu_2",
        tool: "run_build",
        status: "success",
        checkStatus: "failed",
        errorCount: 2,
        firstError: "TS2345: bad",
      },
      ["orders: agent <- run_build (failed), 2 error(s): TS2345: bad"],
    ],
    [
      "agent-tool-result (run_build, tool itself crashed)",
      {
        type: "agent-tool-result",
        timestamp,
        api: "orders",
        toolUseId: "tu_2b",
        tool: "run_build",
        status: "error",
      },
      ["orders: agent <- run_build (tool error)"],
    ],
    [
      "agent-tool-result (run_tests, with counts and first failure)",
      {
        type: "agent-tool-result",
        timestamp,
        api: "orders",
        toolUseId: "tu_3",
        tool: "run_tests",
        status: "success",
        checkStatus: "failed",
        passed: 9,
        failed: 1,
        firstFailure: "shipping.test.ts > applies free shipping",
      },
      [
        "orders: agent <- run_tests (failed), 9 passed / 1 failed: shipping.test.ts > applies free shipping",
      ],
    ],
    [
      "file-edited",
      {
        type: "file-edited",
        timestamp,
        api: "orders",
        file: "src/a.ts",
        added: 3,
        removed: 1,
        diff: "--- a\n+++ b\n",
      },
      ["orders: edited src/a.ts (+3/-1)"],
    ],
    [
      "check-result (passed)",
      {
        type: "check-result",
        timestamp,
        api: "orders",
        check: { name: "typecheck", status: "passed" },
      },
      ["orders: typecheck passed"],
    ],
    [
      "check-result (failed, with detail)",
      {
        type: "check-result",
        timestamp,
        api: "orders",
        check: { name: "typecheck", status: "failed", detail: "boom" },
      },
      ["orders: typecheck failed", "boom"],
    ],
    [
      "cost-updated",
      {
        type: "cost-updated",
        timestamp,
        api: "orders",
        spentUsd: 0.12,
        limitUsd: 1,
      },
      ["orders: $0.12 of $1.00 spent"],
    ],
  ])("%s", (_name, event, expected) => {
    createPlainRenderer().onEvent(event);
    expect(logLines()).toEqual(expected);
  });

  it("prints a plain headline for a service-completed event with nothing to review", () => {
    const service: ServiceResult = {
      service: "checkout-web",
      language: "typescript",
      branch: "schemend/update",
      steps: ["detect", "baseline", "regenerate", "impact", "fix", "verify"],
      changedFiles: ["src/a.ts"],
      checks: [{ name: "test", status: "passed" }],
      review: [],
      confidence: "verified-by-tests",
      costUsd: 0.12,
    };

    createPlainRenderer().onEvent({
      type: "service-completed",
      timestamp,
      api: "orders",
      service,
    });

    expect(logLines()).toEqual([
      "checkout-web: verified-by-tests -> schemend/update",
    ]);
  });

  it("appends the review reasons for a service-completed event that needs review", () => {
    const service: ServiceResult = {
      service: "checkout-web",
      language: "typescript",
      branch: "",
      steps: ["detect", "baseline"],
      changedFiles: [],
      checks: [],
      review: [{ file: "src/a.ts", reason: "could not verify the fix" }],
      confidence: "unverified",
      costUsd: 0,
    };

    createPlainRenderer().onEvent({
      type: "service-completed",
      timestamp,
      api: "orders",
      service,
    });

    expect(logLines()).toEqual([
      "checkout-web: unverified (needs review: could not verify the fix)",
    ]);
  });

  it("announces no changes and prints the budget line on run-finished", () => {
    createPlainRenderer().onEvent({
      type: "run-finished",
      timestamp,
      report: {
        api: "orders",
        startedAt: timestamp,
        finishedAt: timestamp,
        changes: [],
        services: [],
        budgetUsd: 1,
        spentUsd: 0,
      },
    });

    expect(logLines()).toEqual([
      "No API changes detected.",
      "$0.00 of $1.00 budget used",
    ]);
  });

  it("notes the stopped reason on run-finished without the no-changes line", () => {
    createPlainRenderer().onEvent({
      type: "run-finished",
      timestamp,
      report: {
        api: "orders",
        startedAt: timestamp,
        finishedAt: timestamp,
        changes: [breakingChange],
        services: [],
        budgetUsd: 1,
        spentUsd: 1,
        stoppedReason: "budget exceeded",
      },
    });

    expect(logLines()).toEqual([
      "$1.00 of $1.00 budget used (stopped: budget exceeded)",
    ]);
  });
});
