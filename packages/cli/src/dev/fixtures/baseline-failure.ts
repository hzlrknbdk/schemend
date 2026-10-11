import type { ApiChange, CheckEvent } from "@schemend/core";
import { createTimestampSequence } from "./helpers.js";

const change: ApiChange = {
  id: "response-property-removed:GET:/orders#0",
  severity: "breaking",
  summary: "'totalPrice' was removed from the response",
  target: "GET /orders",
  source: { tool: "oasdiff", id: "response-property-removed", level: 2 },
};

const buildDetail = [
  "src/lib/analytics.ts(14,3): error TS2304: Cannot find name 'trackPageView'.",
  "",
].join("\n");

const ts = createTimestampSequence("2026-01-01T12:00:00.000Z");

/** The consumer's own checkout was already broken before any schemend involvement (SPEC §2 step
 * 3): the fix is never attempted, and nothing is committed. */
export const events: CheckEvent[] = [
  {
    type: "run-started",
    timestamp: ts(),
    eventSchemaVersion: 1,
    apis: ["orders"],
    budgetUsd: 1,
  },
  { type: "step-started", timestamp: ts(), api: "orders", step: "detect" },
  {
    type: "changes-detected",
    timestamp: ts(),
    api: "orders",
    changes: [change],
  },
  {
    type: "step-finished",
    timestamp: ts(),
    api: "orders",
    step: "detect",
    durationMs: 300,
    status: "passed",
  },
  { type: "step-started", timestamp: ts(), api: "orders", step: "baseline" },
  {
    type: "check-result",
    timestamp: ts(),
    api: "orders",
    check: { name: "typecheck", status: "failed", detail: buildDetail },
  },
  {
    type: "check-result",
    timestamp: ts(),
    api: "orders",
    check: { name: "test", status: "failed", detail: "1 failing, 9 passing" },
  },
  {
    type: "step-finished",
    timestamp: ts(),
    api: "orders",
    step: "baseline",
    durationMs: 4600,
    status: "failed",
    reason: "baseline-failed",
  },
  {
    type: "service-completed",
    timestamp: ts(),
    api: "orders",
    service: {
      service: "checkout-web",
      language: "typescript",
      branch: "",
      steps: ["detect", "baseline"],
      changedFiles: [],
      checks: [
        { name: "typecheck", status: "failed", detail: buildDetail },
        { name: "test", status: "failed", detail: "1 failing, 9 passing" },
      ],
      review: [
        {
          file: "/repo/apps/checkout-web",
          reason: "baseline build/test failed before any fix was attempted",
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
      api: "orders",
      startedAt: "2026-01-01T12:00:00.000Z",
      finishedAt: ts(),
      changes: [change],
      services: [
        {
          service: "checkout-web",
          language: "typescript",
          branch: "",
          steps: ["detect", "baseline"],
          changedFiles: [],
          checks: [
            { name: "typecheck", status: "failed", detail: buildDetail },
            { name: "test", status: "failed", detail: "1 failing, 9 passing" },
          ],
          review: [
            {
              file: "/repo/apps/checkout-web",
              reason: "baseline build/test failed before any fix was attempted",
            },
          ],
          confidence: "unverified",
          costUsd: 0,
        },
      ],
      budgetUsd: 1,
      spentUsd: 0,
    },
  },
];
