import { exec as execCallback } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { ExecResult } from "@schemend/core";
import { dependencyVolumeName, ensureDockerCtx } from "@schemend/core";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { javaAdapter } from "./adapter.js";

function realExec(command: string, cwd?: string): Promise<ExecResult> {
  return new Promise((resolve) => {
    execCallback(
      command,
      { cwd, maxBuffer: 20 * 1024 * 1024 },
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

async function dockerAvailable(): Promise<boolean> {
  const result = await realExec("docker info");
  return result.exitCode === 0;
}

const GIT_ENV = "-c user.email=a@b.c -c user.name=a -c commit.gpgsign=false";

const SCHEMA_BEFORE = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../../eval/scenarios/field-to-object/schema.before.json",
);

let repoRoot: string;
// Two levels deep (apps/consumer), so the schema reference needs "../../" to reach
// services/orders - proving the mechanism for an arbitrary depth, not just invoice's own
// coincidental one-level-up shape.
let consumerRoot: string;

async function write(relPath: string, content: string): Promise<void> {
  const full = path.join(repoRoot, relPath);
  await mkdir(path.dirname(full), { recursive: true });
  await writeFile(full, content);
}

// Same shape as regenerate.integration.test.ts's fixture (spring-boot-starter-test, which is
// exactly what exposed the dependency:go-offline gap - see DECISIONS.md), just two levels deep.
const POM = `<?xml version="1.0" encoding="UTF-8"?>
<project xmlns="http://maven.apache.org/POM/4.0.0">
  <modelVersion>4.0.0</modelVersion>
  <parent>
    <groupId>org.springframework.boot</groupId>
    <artifactId>spring-boot-starter-parent</artifactId>
    <version>3.5.16</version>
    <relativePath/>
  </parent>
  <groupId>com.example</groupId>
  <artifactId>probe</artifactId>
  <version>0.0.1</version>
  <properties>
    <orders.openapi.spec>\${project.basedir}/../../services/orders/openapi.json</orders.openapi.spec>
  </properties>
  <dependencies>
    <dependency>
      <groupId>org.springframework.boot</groupId>
      <artifactId>spring-boot-starter-web</artifactId>
    </dependency>
    <dependency>
      <groupId>jakarta.annotation</groupId>
      <artifactId>jakarta.annotation-api</artifactId>
    </dependency>
    <dependency>
      <groupId>io.swagger.core.v3</groupId>
      <artifactId>swagger-annotations-jakarta</artifactId>
      <version>2.2.25</version>
    </dependency>
    <dependency>
      <groupId>org.springframework.boot</groupId>
      <artifactId>spring-boot-starter-test</artifactId>
      <scope>test</scope>
    </dependency>
  </dependencies>
  <build>
    <plugins>
      <plugin>
        <groupId>org.openapitools</groupId>
        <artifactId>openapi-generator-maven-plugin</artifactId>
        <version>7.26.0</version>
        <executions>
          <execution>
            <phase>generate-sources</phase>
            <goals><goal>generate</goal></goals>
            <configuration>
              <inputSpec>\${orders.openapi.spec}</inputSpec>
              <generatorName>java</generatorName>
              <library>resttemplate</library>
              <apiPackage>com.example.client.api</apiPackage>
              <modelPackage>com.example.client.model</modelPackage>
              <invokerPackage>com.example.client.invoker</invokerPackage>
              <generateApiTests>false</generateApiTests>
              <generateModelTests>false</generateModelTests>
              <generateApiDocumentation>false</generateApiDocumentation>
              <generateModelDocumentation>false</generateModelDocumentation>
              <configOptions>
                <useJakartaEe>true</useJakartaEe>
                <openApiNullable>false</openApiNullable>
              </configOptions>
            </configuration>
          </execution>
        </executions>
      </plugin>
    </plugins>
  </build>
</project>`;

beforeEach(async () => {
  repoRoot = await mkdtemp(
    path.join(tmpdir(), "schemend-lang-java-docker-visibility-"),
  );
  consumerRoot = path.join(repoRoot, "apps", "consumer");
  await mkdir(consumerRoot, { recursive: true });

  await mkdir(path.join(repoRoot, "services", "orders"), {
    recursive: true,
  });
  await writeFile(
    path.join(repoRoot, "services", "orders", "openapi.json"),
    await readFile(SCHEMA_BEFORE, "utf-8"),
  );

  await write("apps/consumer/pom.xml", POM);
  await write(
    "apps/consumer/src/main/java/com/example/OrderReader.java",
    [
      "package com.example;",
      "",
      "import com.example.client.model.Order;",
      "",
      "public class OrderReader {",
      "  public static double total(Order order) {",
      "    return order.getTotalPrice().doubleValue();",
      "  }",
      "}",
      "",
    ].join("\n"),
  );
  await write(
    "apps/consumer/src/test/java/com/example/OrderReaderTest.java",
    [
      "package com.example;",
      "",
      "import com.example.client.model.Order;",
      "import java.math.BigDecimal;",
      "import org.junit.jupiter.api.Test;",
      "import static org.junit.jupiter.api.Assertions.assertEquals;",
      "",
      "class OrderReaderTest {",
      "  @Test",
      "  void readsTheTotal() {",
      "    Order order = new Order();",
      "    order.setTotalPrice(BigDecimal.valueOf(2499.9));",
      "    assertEquals(2499.9, OrderReader.total(order));",
      "  }",
      "}",
      "",
    ].join("\n"),
  );

  await realExec(`git ${GIT_ENV} init -q`, repoRoot);
});

// repoRoot is a fresh temp dir per test, so ensureDockerCtx's dependency volume (keyed by it) is
// unique per run and would never get pruned by a later run - remove it here, same reasoning as
// check.cancellation.test.ts, so repeated runs don't accumulate orphaned Docker volumes.
afterEach(async () => {
  const volume = await dependencyVolumeName(
    consumerRoot,
    path.join(consumerRoot, "pom.xml"),
  );
  await realExec(`docker volume rm ${volume}`);
  await rm(repoRoot, { recursive: true, force: true });
});

// Closes a real gap: neither existing Docker integration test (agent-tools/regenerate) exercises
// ensureDockerCtx/ensureContainerDeps at all - both bypass them with a bespoke docker invocation
// (a directly-mounted ~/.m2 or an explicit --offline flag), so the actual production combination
// (dependency:go-offline-replaced install, broad repo-root mount, --network none checks) had
// never been run for real before this task.
describe.runIf(await dockerAvailable())(
  "ensureDockerCtx + javaAdapter.build/test (real Docker, real mvn)",
  () => {
    it("builds and tests cleanly when the schema is two directories above the consumer", async () => {
      const { ctx } = await ensureDockerCtx(
        javaAdapter,
        consumerRoot,
        repoRoot,
        (command) => realExec(command),
        undefined,
        undefined,
      );

      const buildResult = await javaAdapter.build(ctx);
      expect(buildResult).toEqual({ name: "compile", status: "passed" });

      const testResult = await javaAdapter.test(ctx);
      expect(testResult).toEqual({ name: "test", status: "passed" });
    }, 180_000);

    // installCommand's own `mvn test` can hit the exact same compile error a genuinely broken
    // baseline would - `-Dmaven.test.failure.ignore=true` only covers a failed test *assertion*,
    // not this (verified: without `|| true`, this install command alone exits 1 here). Without
    // `|| true`, ensureContainerDeps would throw and crash runCheck with an "install failed"
    // error instead of the real baseline-failed path (check.ts: `adapter.build`/`test` after
    // ensureDockerCtx returns, unaffected by install's own exit code, are what set
    // StepFailureReason "baseline-failed").
    it("doesn't throw from ensureDockerCtx when the baseline itself doesn't compile - adapter.build reports the failure instead of install crashing", async () => {
      await write(
        "apps/consumer/src/main/java/com/example/OrderReader.java",
        [
          "package com.example;",
          "",
          "public class OrderReader {",
          "  public static double total(Object order) {",
          "    return thisMethodDoesNotExist(order);",
          "  }",
          "}",
          "",
        ].join("\n"),
      );

      const { ctx } = await ensureDockerCtx(
        javaAdapter,
        consumerRoot,
        repoRoot,
        (command) => realExec(command),
        undefined,
        undefined,
      );

      const buildResult = await javaAdapter.build(ctx);
      expect(buildResult.status).toBe("failed");
      expect(buildResult.detail).toContain("thisMethodDoesNotExist");
    }, 180_000);
  },
);
