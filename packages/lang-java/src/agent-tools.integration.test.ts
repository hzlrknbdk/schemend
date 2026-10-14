import { exec as execCallback } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import type { ApiChange, ApiEntry } from "@schemend/core";
import { buildAgentTools, type ExecResult } from "@schemend/core";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { build } from "./checks.js";
import { findAffected } from "./impact.js";

function realExec(command: string): Promise<ExecResult> {
  return new Promise((resolve) => {
    execCallback(
      command,
      { cwd: root, maxBuffer: 20 * 1024 * 1024 },
      (error, stdout, stderr) => {
        resolve({
          exitCode: !error
            ? 0
            : typeof error.code === "number"
              ? error.code
              : 1,
          stdout,
          stderr,
        });
      },
    );
  });
}

// In production, findAffected/build run through ensureDockerCtx's broad mount (the whole repo at
// /workspace, the consumer at a subpath - see check.ts), which javac paths need
// resolveContainerPath to map back to a host path (ctx.repoRoot). This test skips that generic
// machinery and mounts at the SAME absolute path on both sides instead, so javac's reported paths
// already equal ctx.root exactly with no translation needed (no ctx.repoRoot is set here, so
// resolveContainerPath is a no-op anyway) - simpler for testing buildAgentTools' dynamic allowlist
// behavior in isolation, since Docker here only stands in for a local Maven this machine lacks.
function dockerExec(command: string): Promise<ExecResult> {
  return realExec(
    `docker run --rm -v ${root}:${root} -v ${process.env.HOME}/.m2:/root/.m2 ` +
      `-w ${root} maven:3.9.9-eclipse-temurin-21 sh -c ${JSON.stringify(command)}`,
  );
}

async function dockerAvailable(): Promise<boolean> {
  const result = await realExec("docker info");
  return result.exitCode === 0;
}

let root: string;

async function write(relPath: string, content: string): Promise<void> {
  const full = path.join(root, relPath);
  await mkdir(path.dirname(full), { recursive: true });
  await writeFile(full, content);
}

const POM = `<?xml version="1.0" encoding="UTF-8"?>
<project xmlns="http://maven.apache.org/POM/4.0.0">
  <modelVersion>4.0.0</modelVersion>
  <groupId>com.example</groupId>
  <artifactId>probe</artifactId>
  <version>0.0.1</version>
  <properties>
    <maven.compiler.source>21</maven.compiler.source>
    <maven.compiler.target>21</maven.compiler.target>
    <project.build.sourceEncoding>UTF-8</project.build.sourceEncoding>
  </properties>
  <dependencies>
    <dependency>
      <groupId>org.junit.jupiter</groupId>
      <artifactId>junit-jupiter</artifactId>
      <version>5.11.0</version>
      <scope>test</scope>
    </dependency>
  </dependencies>
</project>`;

// The "already regenerated" state: Order only has getTotal(), not getTotalPrice() - both
// InvoiceCalculator (main) and InvoiceCalculatorTest (test) still call the removed getter.
async function writeBrokenFixture(): Promise<void> {
  await write("pom.xml", POM);
  await write(
    "src/main/java/com/example/Order.java",
    "package com.example;\n\npublic class Order {\n  public double getTotal() { return 0; }\n}\n",
  );
  await write(
    "src/main/java/com/example/InvoiceCalculator.java",
    [
      "package com.example;",
      "",
      "public class InvoiceCalculator {",
      "  public static boolean isEligible(Order order) {",
      "    return order.getTotalPrice() >= 2000;",
      "  }",
      "}",
      "",
    ].join("\n"),
  );
  await write(
    "src/test/java/com/example/InvoiceCalculatorTest.java",
    [
      "package com.example;",
      "",
      "class InvoiceCalculatorTest {",
      "  void eligible() {",
      "    Order order = new Order();",
      "    double x = order.getTotalPrice();",
      "    InvoiceCalculator.isEligible(order);",
      "  }",
      "}",
      "",
    ].join("\n"),
  );
}

const api: ApiEntry = {
  name: "orders",
  kind: "internal",
  source: { type: "openapi", location: "../orders/openapi.json" },
  usedIn: [],
};

const totalPriceRemoved: ApiChange = {
  id: "response-property-removed:GET:/orders#0",
  severity: "breaking",
  summary: "removed the required property `totalPrice` from the response",
  target: "GET /orders",
  source: { tool: "oasdiff", id: "response-property-removed", level: 2 },
};

beforeEach(async () => {
  root = await mkdtemp(path.join(tmpdir(), "schemend-lang-java-agent-"));
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

describe.runIf(await dockerAvailable())(
  "dynamic allowlist expansion (real Docker, real mvn)",
  () => {
    it("lets the agent fix main code then the test fixture without ever being stuck, when both are broken by the same schema change", async () => {
      await writeBrokenFixture();
      const ctx = { root, exec: dockerExec };

      const initialAffected = await findAffected(ctx, api, [totalPriceRemoved]);
      // Main compile fails before test-compile ever runs - the test fixture's own identical
      // breakage is invisible to this first call. This is the gap DECISIONS.md documents.
      expect(initialAffected.map((l) => l.file)).toEqual([
        "src/main/java/com/example/InvoiceCalculator.java",
      ]);

      const { tools } = buildAgentTools(
        ctx,
        { build, test: build, findAffected },
        initialAffected.map((l) => l.file),
        api,
        [totalPriceRemoved],
      );
      const editFile = tools.find((t) => t.name === "edit_file");
      const runBuild = tools.find((t) => t.name === "run_build");
      if (!editFile || !runBuild) throw new Error("tool not found");

      // Fix the main code the agent was actually allowed to touch.
      const fixed = await editFile.handler(
        {
          path: "src/main/java/com/example/InvoiceCalculator.java",
          content: [
            "package com.example;",
            "",
            "public class InvoiceCalculator {",
            "  public static boolean isEligible(Order order) {",
            "    return order.getTotal() >= 2000;",
            "  }",
            "}",
            "",
          ].join("\n"),
        },
        undefined,
      );
      expect(fixed.isError).toBeFalsy();

      // run_build now reaches test-compile for the first time and should expand allowed.
      const buildResult = await runBuild.handler({}, undefined);
      const buildText =
        buildResult.content[0]?.type === "text"
          ? buildResult.content[0].text
          : "";
      expect(buildText).toContain("failed");
      expect(buildText).toContain("InvoiceCalculatorTest");

      const testFixResult = await editFile.handler(
        {
          path: "src/test/java/com/example/InvoiceCalculatorTest.java",
          content: [
            "package com.example;",
            "",
            "class InvoiceCalculatorTest {",
            "  void eligible() {",
            "    Order order = new Order();",
            "    double x = order.getTotal();",
            "    InvoiceCalculator.isEligible(order);",
            "  }",
            "}",
            "",
          ].join("\n"),
        },
        undefined,
      );

      expect(testFixResult.isError).toBeFalsy();

      const finalBuild = await runBuild.handler({}, undefined);
      const finalText =
        finalBuild.content[0]?.type === "text"
          ? finalBuild.content[0].text
          : "";
      expect(finalText).toBe("compile: passed");
    }, 120_000);
  },
);
