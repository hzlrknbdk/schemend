import type { AffectedLocation, ApiChange, CheckEvent } from "@schemend/core";
import { createTimestampSequence } from "./helpers.js";

const ordersChange: ApiChange = {
  id: "response-property-removed:GET:/orders#0",
  severity: "breaking",
  summary: "'totalPrice' was removed from the response",
  target: "GET /orders",
  source: { tool: "oasdiff", id: "response-property-removed", level: 2 },
};

const invoicesChange: ApiChange = {
  id: "response-property-removed:GET:/invoices#0",
  severity: "breaking",
  summary: "'amount' was removed from the response",
  target: "GET /invoices",
  source: { tool: "oasdiff", id: "response-property-removed", level: 2 },
};

const ordersAffected: AffectedLocation = {
  file: "src/lib/shipping.ts",
  line: 6,
  changeId: ordersChange.id,
  snippet: "return order.totalPrice >= FREE_SHIPPING_THRESHOLD;",
};

const invoicesAffected: AffectedLocation = {
  file: "src/lib/invoice-summary.ts",
  line: 9,
  changeId: invoicesChange.id,
  snippet: "return formatPrice(invoice.amount);",
};

const diff = [
  "--- src/lib/shipping.ts",
  "+++ src/lib/shipping.ts",
  "@@ -4,7 +4,7 @@",
  " export function appliesFreeShipping(order: Order): boolean {",
  "-  return order.totalPrice >= FREE_SHIPPING_THRESHOLD;",
  "+  return order.total.amount >= FREE_SHIPPING_THRESHOLD;",
  " }",
  "",
].join("\n");

const ts = createTimestampSequence("2026-01-01T11:00:00.000Z");

/**
 * Two apis share one $0.10 budget (SPEC §6). Fixing "orders" alone costs $0.12 - the SDK's real
 * cost is only known after the call, so the overrun is only visible once cost-updated fires, not
 * predicted in advance. By the time "invoices" is up, the budget is already spent: its own detect/
 * baseline/regenerate/impact still run (they're free, local commands), but the pre-fix budget
 * check stops it before the agent is ever called, and the run ends there.
 */
export const events: CheckEvent[] = [
  {
    type: "run-started",
    timestamp: ts(),
    eventSchemaVersion: 1,
    apis: ["orders", "invoices"],
    budgetUsd: 0.1,
  },
  { type: "step-started", timestamp: ts(), api: "orders", step: "detect" },
  {
    type: "changes-detected",
    timestamp: ts(),
    api: "orders",
    changes: [ordersChange],
  },
  {
    type: "step-finished",
    timestamp: ts(),
    api: "orders",
    step: "detect",
    durationMs: 310,
    status: "passed",
  },
  { type: "step-started", timestamp: ts(), api: "orders", step: "baseline" },
  {
    type: "check-result",
    timestamp: ts(),
    api: "orders",
    check: { name: "typecheck", status: "passed" },
  },
  {
    type: "check-result",
    timestamp: ts(),
    api: "orders",
    check: { name: "test", status: "passed" },
  },
  {
    type: "step-finished",
    timestamp: ts(),
    api: "orders",
    step: "baseline",
    durationMs: 4100,
    status: "passed",
  },
  { type: "step-started", timestamp: ts(), api: "orders", step: "regenerate" },
  {
    type: "step-finished",
    timestamp: ts(),
    api: "orders",
    step: "regenerate",
    durationMs: 780,
    status: "passed",
  },
  { type: "step-started", timestamp: ts(), api: "orders", step: "impact" },
  {
    type: "affected-found",
    timestamp: ts(),
    api: "orders",
    affected: [ordersAffected],
  },
  {
    type: "step-finished",
    timestamp: ts(),
    api: "orders",
    step: "impact",
    durationMs: 640,
    status: "passed",
  },
  { type: "step-started", timestamp: ts(), api: "orders", step: "fix" },
  {
    type: "agent-tool-call",
    timestamp: ts(),
    api: "orders",
    toolUseId: "tu_1",
    tool: "edit_file",
    file: "src/lib/shipping.ts",
  },
  {
    type: "file-edited",
    timestamp: ts(),
    api: "orders",
    file: "src/lib/shipping.ts",
    added: 1,
    removed: 1,
    diff,
  },
  {
    type: "agent-tool-result",
    timestamp: ts(),
    api: "orders",
    toolUseId: "tu_1",
    tool: "edit_file",
    status: "success",
    file: "src/lib/shipping.ts",
  },
  {
    type: "agent-tool-call",
    timestamp: ts(),
    api: "orders",
    toolUseId: "tu_2",
    tool: "run_build",
  },
  {
    type: "agent-tool-result",
    timestamp: ts(),
    api: "orders",
    toolUseId: "tu_2",
    tool: "run_build",
    status: "success",
  },
  {
    type: "agent-tool-call",
    timestamp: ts(),
    api: "orders",
    toolUseId: "tu_3",
    tool: "run_tests",
  },
  {
    type: "agent-tool-result",
    timestamp: ts(),
    api: "orders",
    toolUseId: "tu_3",
    tool: "run_tests",
    status: "success",
    passed: 10,
    failed: 0,
  },
  {
    type: "step-finished",
    timestamp: ts(),
    api: "orders",
    step: "fix",
    durationMs: 15800,
    status: "passed",
  },
  {
    type: "cost-updated",
    timestamp: ts(),
    api: "orders",
    spentUsd: 0.12,
    limitUsd: 0.1,
  },
  { type: "step-started", timestamp: ts(), api: "orders", step: "verify" },
  {
    type: "check-result",
    timestamp: ts(),
    api: "orders",
    check: { name: "typecheck", status: "passed" },
  },
  {
    type: "check-result",
    timestamp: ts(),
    api: "orders",
    check: { name: "test", status: "passed" },
  },
  {
    type: "step-finished",
    timestamp: ts(),
    api: "orders",
    step: "verify",
    durationMs: 4300,
    status: "passed",
  },
  { type: "step-started", timestamp: ts(), api: "orders", step: "commit" },
  {
    type: "step-finished",
    timestamp: ts(),
    api: "orders",
    step: "commit",
    durationMs: 85,
    status: "passed",
  },
  {
    type: "service-completed",
    timestamp: ts(),
    api: "orders",
    service: {
      service: "checkout-web",
      language: "typescript",
      branch: "schemend/update",
      steps: ["detect", "baseline", "regenerate", "impact", "fix", "verify"],
      changedFiles: ["src/lib/shipping.ts"],
      checks: [
        { name: "typecheck", status: "passed" },
        { name: "test", status: "passed" },
      ],
      review: [],
      confidence: "verified-by-tests",
      costUsd: 0.12,
    },
  },
  // invoices: detect/baseline/regenerate/impact still run (they're free), but the budget's
  // already gone by the time the fix would start.
  { type: "step-started", timestamp: ts(), api: "invoices", step: "detect" },
  {
    type: "changes-detected",
    timestamp: ts(),
    api: "invoices",
    changes: [invoicesChange],
  },
  {
    type: "step-finished",
    timestamp: ts(),
    api: "invoices",
    step: "detect",
    durationMs: 290,
    status: "passed",
  },
  { type: "step-started", timestamp: ts(), api: "invoices", step: "baseline" },
  {
    type: "check-result",
    timestamp: ts(),
    api: "invoices",
    check: { name: "typecheck", status: "passed" },
  },
  {
    type: "check-result",
    timestamp: ts(),
    api: "invoices",
    check: { name: "test", status: "passed" },
  },
  {
    type: "step-finished",
    timestamp: ts(),
    api: "invoices",
    step: "baseline",
    durationMs: 3600,
    status: "passed",
  },
  {
    type: "step-started",
    timestamp: ts(),
    api: "invoices",
    step: "regenerate",
  },
  {
    type: "step-finished",
    timestamp: ts(),
    api: "invoices",
    step: "regenerate",
    durationMs: 700,
    status: "passed",
  },
  { type: "step-started", timestamp: ts(), api: "invoices", step: "impact" },
  {
    type: "affected-found",
    timestamp: ts(),
    api: "invoices",
    affected: [invoicesAffected],
  },
  {
    type: "step-finished",
    timestamp: ts(),
    api: "invoices",
    step: "impact",
    durationMs: 580,
    status: "passed",
  },
  { type: "step-started", timestamp: ts(), api: "invoices", step: "commit" },
  {
    type: "step-finished",
    timestamp: ts(),
    api: "invoices",
    step: "commit",
    durationMs: 60,
    status: "passed",
  },
  {
    type: "service-completed",
    timestamp: ts(),
    api: "invoices",
    service: {
      service: "checkout-web",
      language: "typescript",
      branch: "schemend/update",
      steps: ["detect", "baseline", "regenerate", "impact"],
      changedFiles: ["generated/invoices-api.d.ts"],
      checks: [],
      review: [
        {
          file: "/repo/apps/checkout-web",
          reason: "budget exhausted before this api could be fixed",
        },
      ],
      confidence: "unverified",
      costUsd: 0,
    },
  },
  {
    type: "run-finished",
    timestamp: ts(),
    report: {
      api: "orders, invoices",
      startedAt: "2026-01-01T11:00:00.000Z",
      finishedAt: ts(),
      changes: [ordersChange, invoicesChange],
      services: [
        {
          service: "checkout-web",
          language: "typescript",
          branch: "schemend/update",
          steps: [
            "detect",
            "baseline",
            "regenerate",
            "impact",
            "fix",
            "verify",
          ],
          changedFiles: ["src/lib/shipping.ts"],
          checks: [
            { name: "typecheck", status: "passed" },
            { name: "test", status: "passed" },
          ],
          review: [],
          confidence: "verified-by-tests",
          costUsd: 0.12,
        },
        {
          service: "checkout-web",
          language: "typescript",
          branch: "schemend/update",
          steps: ["detect", "baseline", "regenerate", "impact"],
          changedFiles: ["generated/invoices-api.d.ts"],
          checks: [],
          review: [
            {
              file: "/repo/apps/checkout-web",
              reason: "budget exhausted before this api could be fixed",
            },
          ],
          confidence: "unverified",
          costUsd: 0,
        },
      ],
      budgetUsd: 0.1,
      spentUsd: 0.12,
      stoppedReason: "budget exceeded",
    },
  },
];
