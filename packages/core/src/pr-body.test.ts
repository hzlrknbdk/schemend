import { describe, expect, it } from "vitest";
import { buildPrBody } from "./pr-body.js";
import type { ApiChange, ServiceResult } from "./types.js";

const changes: ApiChange[] = [
  {
    id: "response-property-removed/orders-0",
    severity: "breaking",
    summary: "property 'totalPrice' was removed",
    target: "GET /orders/{id}",
    source: { tool: "oasdiff", id: "response-property-removed", level: 3 },
  },
];

const service: ServiceResult = {
  service: "checkout-web",
  language: "typescript",
  branch: "schemend/update",
  steps: ["detect", "baseline", "regenerate", "impact", "fix", "verify"],
  changedFiles: ["src/lib/shipping.ts"],
  checks: [
    { name: "build", status: "passed" },
    { name: "test", status: "passed" },
  ],
  review: [
    {
      file: "src/lib/format.ts",
      reason:
        "hardcoded TRY suffix, couldn't verify the new currency field is always TRY",
      source: "agent-flag",
    },
    {
      file: "src/lib/shipping.ts",
      reason: "orchestrator-generated note, not from the agent's flag tool",
    },
  ],
  confidence: "verified-by-tests",
  costUsd: 0.0554,
};

describe("buildPrBody", () => {
  it("renders every SPEC §10 section, agent-flagged items split from orchestrator ones", () => {
    expect(buildPrBody("orders", changes, service)).toMatchSnapshot();
  });

  it("titles the PR with the service and api name", () => {
    const { title } = buildPrBody("orders", changes, service);
    expect(title).toBe("schemend: update checkout-web for orders change");
  });

  it("says 'Nothing flagged.' when review is empty", () => {
    const { body } = buildPrBody("orders", changes, { ...service, review: [] });
    expect(body).toContain("## Needs your review\nNothing flagged.");
  });

  it("truncates a body past ~65K characters and points to the run report", () => {
    const hugeReview: ServiceResult = {
      ...service,
      review: Array.from({ length: 2000 }, (_, i) => ({
        file: `src/file-${i}.ts`,
        reason: "x".repeat(50),
      })),
    };
    const { body } = buildPrBody("orders", changes, hugeReview);
    expect(body.length).toBeLessThanOrEqual(65_000);
    expect(
      body.endsWith("(truncated - see the full run report for details)*"),
    ).toBe(true);
  });
});
