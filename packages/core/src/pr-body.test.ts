import { describe, expect, it } from "vitest";
import type { ApiServiceResult } from "./pr-body.js";
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

const oneApi: ApiServiceResult[] = [{ api: "orders", service }];

describe("buildPrBody", () => {
  it("renders every SPEC §10 section, agent-flagged items split from orchestrator ones", () => {
    expect(buildPrBody("orders", changes, oneApi)).toMatchSnapshot();
  });

  it("titles the PR with the service and api name", () => {
    const { title } = buildPrBody("orders", changes, oneApi);
    expect(title).toBe("schemend: update checkout-web for orders change");
  });

  it("says 'Nothing flagged.' when review is empty", () => {
    const { body } = buildPrBody("orders", changes, [
      { api: "orders", service: { ...service, review: [] } },
    ]);
    expect(body).toContain("## Needs your review\nNothing flagged.");
  });

  it("truncates a body past ~65K characters by default and points to the run report", () => {
    const hugeReview: ServiceResult = {
      ...service,
      review: Array.from({ length: 2000 }, (_, i) => ({
        file: `src/file-${i}.ts`,
        reason: "x".repeat(50),
      })),
    };
    const { body } = buildPrBody("orders", changes, [
      { api: "orders", service: hugeReview },
    ]);
    expect(body.length).toBeLessThanOrEqual(65_000);
    expect(
      body.endsWith("(truncated - see the full run report for details)*"),
    ).toBe(true);
  });

  it("truncates to a caller-supplied maxBodyLength instead of the default (e.g. GitLab's larger limit)", () => {
    const hugeReview: ServiceResult = {
      ...service,
      review: Array.from({ length: 2000 }, (_, i) => ({
        file: `src/file-${i}.ts`,
        reason: "x".repeat(50),
      })),
    };
    const unbounded = buildPrBody(
      "orders",
      changes,
      [{ api: "orders", service: hugeReview }],
      1_000_000,
    );
    expect(unbounded.body).not.toContain("truncated");
    expect(unbounded.body.length).toBeGreaterThan(65_000);

    const tighter = buildPrBody(
      "orders",
      changes,
      [{ api: "orders", service: hugeReview }],
      500,
    );
    expect(tighter.body.length).toBeLessThanOrEqual(500);
    expect(
      tighter.body.endsWith(
        "(truncated - see the full run report for details)*",
      ),
    ).toBe(true);
  });

  it("throws when given no service results", () => {
    expect(() => buildPrBody("orders", changes, [])).toThrow(
      "buildPrBody needs at least one service result",
    );
  });

  describe("multiple apis sharing one PR", () => {
    const inventoryService: ServiceResult = {
      service: "checkout-web",
      language: "typescript",
      branch: "schemend/update",
      steps: ["detect", "baseline", "regenerate", "impact"],
      changedFiles: ["src/lib/inventory.ts"],
      checks: [
        { name: "build", status: "passed" },
        { name: "test", status: "passed" },
      ],
      review: [],
      confidence: "verified-by-build",
      costUsd: 0.012,
    };
    const twoApis: ApiServiceResult[] = [
      { api: "orders", service },
      { api: "inventory", service: inventoryService },
    ];

    it("titles the PR with the first service's consumer name", () => {
      const { title } = buildPrBody("orders, inventory", changes, twoApis);
      expect(title).toBe(
        "schemend: update checkout-web for orders, inventory change",
      );
    });

    it("gives each api its own ### subsection in steps/verification/review/cost", () => {
      const { body } = buildPrBody("orders, inventory", changes, twoApis);
      expect(body).toContain("## Steps applied\n### orders\n");
      expect(body).toContain("### inventory\n- detect");
      expect(body).toContain("## Verification\n### orders\n");
      expect(body).toContain("## Needs your review\n### orders\n");
      expect(body).toContain("### inventory\nNothing flagged.");
      expect(body).toContain("## Cost\n### orders\n$0.0554");
      expect(body).toContain("### inventory\n$0.0120");
    });

    it("sums every api's cost into a Total line", () => {
      const { body } = buildPrBody("orders, inventory", changes, twoApis);
      expect(body).toContain("Total: $0.0674");
    });
  });
});
