import { exec as execCallback } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { ApiEntry, ExecResult } from "@schemend/core";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { build, test as runTest } from "./checks.js";
import { regenerateClient } from "./discover.js";

function realExec(command: string): Promise<ExecResult> {
  return new Promise((resolve) => {
    execCallback(
      command,
      { maxBuffer: 20 * 1024 * 1024 },
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

let root: string;
let ordersDir: string;

function dockerExec(command: string): Promise<ExecResult> {
  return realExec(
    `docker run --rm -v ${path.dirname(root)}:${path.dirname(root)} ` +
      `-v ${process.env.HOME}/.m2:/root/.m2 -w ${root} ` +
      `maven:3.9.9-eclipse-temurin-21 sh -c ${JSON.stringify(command)}`,
  );
}

async function write(relPath: string, content: string): Promise<void> {
  const full = path.join(root, relPath);
  await mkdir(path.dirname(full), { recursive: true });
  await writeFile(full, content);
}

const SCHEMA_BEFORE = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../../eval/scenarios/field-to-object/schema.before.json",
);

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
    <orders.openapi.spec>\${project.basedir}/../orders/openapi.json</orders.openapi.spec>
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
  const base = await mkdtemp(path.join(tmpdir(), "schemend-lang-java-regen-"));
  ordersDir = path.join(base, "orders");
  root = path.join(base, "probe");
  await mkdir(ordersDir, { recursive: true });
  await mkdir(root, { recursive: true });
  const { readFile } = await import("node:fs/promises");
  await writeFile(
    path.join(ordersDir, "openapi.json"),
    await readFile(SCHEMA_BEFORE, "utf-8"),
  );
  await write("pom.xml", POM);
  await write(
    "src/main/java/com/example/OrderReader.java",
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
    "src/test/java/com/example/OrderReaderTest.java",
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
});

afterEach(async () => {
  await rm(path.dirname(root), { recursive: true, force: true });
});

describe.runIf(await dockerAvailable())(
  "regenerate + build + test (real Docker, real mvn)",
  () => {
    it("dependency:go-offline fetches the generator plugin too - offline generate/compile/test all succeed afterward", async () => {
      const api: ApiEntry = {
        name: "orders",
        kind: "internal",
        source: {
          type: "openapi",
          location: "../orders/openapi.json",
        },
        usedIn: [],
      };

      const install = await dockerExec("mvn -q -B dependency:go-offline");
      expect(install.exitCode).toBe(0);

      await regenerateClient(
        { root, exec: (cmd) => dockerExec(`${cmd} --offline`) },
        api,
      );

      const buildResult = await build({
        root,
        exec: (cmd) => dockerExec(`${cmd} --offline`),
      });
      expect(buildResult).toEqual({ name: "compile", status: "passed" });

      const testResult = await runTest({
        root,
        exec: (cmd) => dockerExec(`${cmd} --offline`),
      });
      expect(testResult).toEqual({ name: "test", status: "passed" });
    }, 180_000);
  },
);
