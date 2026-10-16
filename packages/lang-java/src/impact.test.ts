import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import type { ApiChange, ApiEntry } from "@schemend/core";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { findAffected } from "./impact.js";

const FIXTURES_DIR = path.join(import.meta.dirname, "fixtures");

let repoRoot: string;
let root: string;

async function write(relPath: string, content: string): Promise<void> {
  const full = path.join(root, relPath);
  await mkdir(path.dirname(full), { recursive: true });
  await writeFile(full, content);
}

// Both fixtures keep the container's /workspace path literally in the text; findAffected's own
// resolveContainerPath maps that back to repoRoot, so no substitution is needed here.
async function readFixture(name: string): Promise<string> {
  return readFile(path.join(FIXTURES_DIR, name), "utf-8");
}

const api: ApiEntry = {
  name: "orders",
  kind: "internal",
  source: { type: "openapi", location: "../orders/openapi.json" },
  usedIn: ["src/main/java/com/schemenddemo/invoice"],
};

const totalPriceRemoved: ApiChange = {
  id: "response-property-removed:GET:/orders#0",
  severity: "breaking",
  summary:
    "removed the required property `items/totalPrice` from the response with the `200` status",
  target: "GET /orders",
  source: { tool: "oasdiff", id: "response-property-removed", level: 2 },
};

beforeEach(async () => {
  repoRoot = await mkdtemp(path.join(tmpdir(), "schemend-lang-java-impact-"));
  root = path.join(repoRoot, "services/invoice");
  await mkdir(root, { recursive: true });
});

afterEach(async () => {
  await rm(repoRoot, { recursive: true, force: true });
});

describe("findAffected", () => {
  it("finds the main-code line using a removed getter and attributes it to the matching change", async () => {
    const output = await readFixture("mvn-test-compile-main-broken.txt");
    await write(
      "src/main/java/com/example/ShippingRule.java",
      [
        "package com.example;",
        "",
        "public class ShippingRule {",
        "  public static boolean qualifies(Order order) {",
        "    return order.getTotalPrice() >= 50;",
        "  }",
        "}",
        "",
      ].join("\n"),
    );
    const exec = async () => ({ exitCode: 1, stdout: output, stderr: "" });

    const locations = await findAffected({ root, repoRoot, exec }, api, [
      totalPriceRemoved,
    ]);

    expect(locations).toHaveLength(1);
    expect(locations[0]).toMatchObject({
      file: "src/main/java/com/example/ShippingRule.java",
      line: 5,
      changeId: totalPriceRemoved.id,
    });
    expect(locations[0]?.snippet).toContain("getTotalPrice");
  });

  it("finds the test-fixture line once the main code compiles and test-compile is reached", async () => {
    const output = await readFixture(
      "mvn-test-compile-main-fixed-test-broken.txt",
    );
    await write(
      "src/test/java/com/example/ShippingRuleTest.java",
      [
        "package com.example;",
        "",
        "class ShippingRuleTest {",
        "  void qualifiesAboveThreshold() {",
        "    Order order = new Order();",
        "    ShippingRule.qualifies(order);",
        "    double x = order.getTotalPrice();",
        "  }",
        "}",
        "",
      ].join("\n"),
    );
    const exec = async () => ({ exitCode: 1, stdout: output, stderr: "" });

    const locations = await findAffected({ root, repoRoot, exec }, api, [
      totalPriceRemoved,
    ]);

    expect(locations).toHaveLength(1);
    expect(locations[0]).toMatchObject({
      file: "src/test/java/com/example/ShippingRuleTest.java",
      line: 10,
      changeId: totalPriceRemoved.id,
    });
  });

  it("drops diagnostics that don't match any change instead of guessing", async () => {
    const output = await readFixture("mvn-test-compile-main-broken.txt");
    const unrelatedChange: ApiChange = {
      id: "unrelated#0",
      severity: "breaking",
      summary: "removed the required property `warehouseId` from the request",
      target: "POST /orders",
      source: { tool: "oasdiff", id: "request-property-removed", level: 2 },
    };
    const exec = async () => ({ exitCode: 1, stdout: output, stderr: "" });

    const locations = await findAffected({ root, repoRoot, exec }, api, [
      unrelatedChange,
    ]);

    expect(locations).toEqual([]);
  });

  it("does not match a bare identifier that merely shares the field's name without a get/set/is prefix", async () => {
    const exec = async () => ({
      exitCode: 1,
      stdout:
        "[ERROR] /x/Y.java:[1,1] cannot find symbol\n  symbol:   variable totalPriceLegacy\n",
      stderr: "",
    });

    const locations = await findAffected({ root, repoRoot, exec }, api, [
      totalPriceRemoved,
    ]);

    expect(locations).toEqual([]);
  });

  it("returns an empty list when the build passes", async () => {
    const exec = async () => ({ exitCode: 0, stdout: "", stderr: "" });

    const locations = await findAffected({ root, repoRoot, exec }, api, [
      totalPriceRemoved,
    ]);

    expect(locations).toEqual([]);
  });
});
