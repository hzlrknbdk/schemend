import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { UnsupportedWorkspaceError } from "@schemend/core";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  assertDockerVisibility,
  assertNotMultiModule,
  detect,
  discoverApis,
  regenerateClient,
} from "./discover.js";

let root: string;

async function write(relPath: string, content: string): Promise<void> {
  const full = path.join(root, relPath);
  await mkdir(path.dirname(full), { recursive: true });
  await writeFile(full, content);
}

function pomWith(body: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<project xmlns="http://maven.apache.org/POM/4.0.0">
  <modelVersion>4.0.0</modelVersion>
  ${body}
</project>`;
}

// Mirrors the real schemend-demo/services/invoice pom.xml: an external parent resolved from the
// repository (empty relativePath), one openapi-generator-maven-plugin execution.
const INVOICE_POM = pomWith(`
  <parent>
    <groupId>org.springframework.boot</groupId>
    <artifactId>spring-boot-starter-parent</artifactId>
    <version>3.5.16</version>
    <relativePath/>
  </parent>
  <groupId>com.schemenddemo</groupId>
  <artifactId>invoice-service</artifactId>
  <version>0.0.1-SNAPSHOT</version>
  <properties>
    <orders.openapi.spec>\${project.basedir}/../orders/openapi.json</orders.openapi.spec>
    <orders.client.package>com.schemenddemo.invoice.client.orders</orders.client.package>
  </properties>
  <build>
    <plugins>
      <plugin>
        <groupId>org.openapitools</groupId>
        <artifactId>openapi-generator-maven-plugin</artifactId>
        <version>7.26.0</version>
        <executions>
          <execution>
            <id>generate-orders-client</id>
            <configuration>
              <inputSpec>\${orders.openapi.spec}</inputSpec>
              <apiPackage>\${orders.client.package}.api</apiPackage>
            </configuration>
          </execution>
        </executions>
      </plugin>
    </plugins>
  </build>
`);

async function writeInvoiceFixture(): Promise<void> {
  await write("pom.xml", INVOICE_POM);
  await write(
    "src/main/java/com/schemenddemo/invoice/OrdersClientConfig.java",
    [
      "package com.schemenddemo.invoice;",
      "",
      "import com.schemenddemo.invoice.client.orders.api.DefaultApi;",
      "",
      "public class OrdersClientConfig {}",
      "",
    ].join("\n"),
  );
  await write(
    "src/main/resources/application.yml",
    [
      "orders:",
      "  api:",
      // biome-ignore lint/suspicious/noTemplateCurlyInString: fixture source text (Spring placeholder syntax), not a real template literal.
      "    url: ${ORDERS_API_URL:http://127.0.0.1:8001}",
      "",
    ].join("\n"),
  );
  await write(
    "src/main/java/com/schemenddemo/invoice/InvoiceCalculator.java",
    "package com.schemenddemo.invoice;\n\npublic class InvoiceCalculator {}\n",
  );
}

beforeEach(async () => {
  root = await mkdtemp(path.join(tmpdir(), "schemend-lang-java-fixtures-"));
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

describe("discoverApis", () => {
  it("finds an API from an openapi-generator-maven-plugin execution", async () => {
    await writeInvoiceFixture();

    const entries = await discoverApis({
      root,
      exec: async () => ({ exitCode: 0, stdout: "", stderr: "" }),
    });

    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      name: "orders",
      kind: "internal",
      source: {
        type: "openapi",
        location: "../orders/openapi.json",
      },
      usedIn: ["src/main/java/com/schemenddemo/invoice"],
    });
  });

  it("records the plugin execution and the application.yml env placeholder as evidence", async () => {
    await writeInvoiceFixture();

    const [entry] = await discoverApis({
      root,
      exec: async () => ({ exitCode: 0, stdout: "", stderr: "" }),
    });

    expect(entry?.evidence).toContain(
      "pom.xml openapi-generator-maven-plugin execution",
    );
    expect(entry?.evidence).toContain(
      "env ORDERS_API_URL in src/main/resources/application.yml",
    );
  });

  it("does not count a file that never imports the apiPackage toward usedIn", async () => {
    await writeInvoiceFixture();
    await write(
      "src/main/java/com/schemenddemo/invoice/Unrelated.java",
      "package com.schemenddemo.invoice;\n\npublic class Unrelated {}\n",
    );

    const [entry] = await discoverApis({
      root,
      exec: async () => ({ exitCode: 0, stdout: "", stderr: "" }),
    });

    expect(entry?.usedIn).toEqual(["src/main/java/com/schemenddemo/invoice"]);
  });

  it("ignores matches inside target/", async () => {
    await writeInvoiceFixture();
    await write(
      "target/generated-sources/com/schemenddemo/invoice/client/orders/api/DefaultApi.java",
      "package com.schemenddemo.invoice.client.orders.api;\n",
    );

    const entries = await discoverApis({
      root,
      exec: async () => ({ exitCode: 0, stdout: "", stderr: "" }),
    });

    expect(entries).toHaveLength(1);
  });

  it("returns an empty list when no openapi-generator-maven-plugin execution is found", async () => {
    await write("pom.xml", pomWith("<groupId>com.example</groupId>"));

    const entries = await discoverApis({
      root,
      exec: async () => ({ exitCode: 0, stdout: "", stderr: "" }),
    });

    expect(entries).toEqual([]);
  });

  it("returns an empty list when there is no pom.xml", async () => {
    const entries = await discoverApis({
      root,
      exec: async () => ({ exitCode: 0, stdout: "", stderr: "" }),
    });

    expect(entries).toEqual([]);
  });

  it("does not recognize a plugin declared only in pluginManagement", async () => {
    await write(
      "pom.xml",
      pomWith(`
        <groupId>com.example</groupId>
        <build>
          <pluginManagement>
            <plugins>
              <plugin>
                <groupId>org.openapitools</groupId>
                <artifactId>openapi-generator-maven-plugin</artifactId>
                <executions>
                  <execution>
                    <configuration>
                      <inputSpec>../orders/openapi.json</inputSpec>
                    </configuration>
                  </execution>
                </executions>
              </plugin>
            </plugins>
          </pluginManagement>
        </build>
      `),
    );

    const entries = await discoverApis({
      root,
      exec: async () => ({ exitCode: 0, stdout: "", stderr: "" }),
    });

    expect(entries).toEqual([]);
  });

  it("does not recognize a plugin declared only inside a profile", async () => {
    await write(
      "pom.xml",
      pomWith(`
        <groupId>com.example</groupId>
        <profiles>
          <profile>
            <id>generate</id>
            <build>
              <plugins>
                <plugin>
                  <groupId>org.openapitools</groupId>
                  <artifactId>openapi-generator-maven-plugin</artifactId>
                  <executions>
                    <execution>
                      <configuration>
                        <inputSpec>../orders/openapi.json</inputSpec>
                      </configuration>
                    </execution>
                  </executions>
                </plugin>
              </plugins>
            </build>
          </profile>
        </profiles>
      `),
    );

    const entries = await discoverApis({
      root,
      exec: async () => ({ exitCode: 0, stdout: "", stderr: "" }),
    });

    expect(entries).toEqual([]);
  });
});

describe("assertNotMultiModule", () => {
  it("does not throw for a project with no parent", async () => {
    await write("pom.xml", pomWith("<groupId>com.example</groupId>"));

    await expect(assertNotMultiModule(root)).resolves.toBeUndefined();
  });

  it("does not throw when the parent has an explicit empty relativePath (resolved from the repository)", async () => {
    await writeInvoiceFixture();

    await expect(assertNotMultiModule(root)).resolves.toBeUndefined();
  });

  it("does not throw when the parent's relativePath points at a file that doesn't exist", async () => {
    await write(
      "pom.xml",
      pomWith(`
        <parent>
          <groupId>com.example</groupId>
          <artifactId>missing-parent</artifactId>
          <version>1.0.0</version>
        </parent>
        <groupId>com.example</groupId>
      `),
    );

    await expect(assertNotMultiModule(root)).resolves.toBeUndefined();
  });

  it("does not throw when the local parent file's GAV doesn't match the <parent> block", async () => {
    await write(
      "pom.xml",
      pomWith(`
        <parent>
          <groupId>com.example</groupId>
          <artifactId>aggregator</artifactId>
          <version>1.0.0</version>
        </parent>
        <groupId>com.example</groupId>
      `),
    );
    await write(
      "../pom.xml",
      pomWith(`
        <groupId>com.example</groupId>
        <artifactId>aggregator</artifactId>
        <version>2.0.0</version>
      `),
    );

    await expect(assertNotMultiModule(root)).resolves.toBeUndefined();
  });

  it("throws UnsupportedWorkspaceError for a real local multi-module reactor", async () => {
    await write(
      "module/pom.xml",
      pomWith(`
        <parent>
          <groupId>com.example</groupId>
          <artifactId>aggregator</artifactId>
          <version>1.0.0</version>
        </parent>
        <artifactId>module</artifactId>
      `),
    );
    await write(
      "pom.xml",
      pomWith(`
        <groupId>com.example</groupId>
        <artifactId>aggregator</artifactId>
        <version>1.0.0</version>
        <packaging>pom</packaging>
        <modules><module>module</module></modules>
      `),
    );

    await expect(
      assertNotMultiModule(path.join(root, "module")),
    ).rejects.toThrow(UnsupportedWorkspaceError);
  });

  it("respects an explicit non-default relativePath", async () => {
    await write(
      "consumer/pom.xml",
      pomWith(`
        <parent>
          <groupId>com.example</groupId>
          <artifactId>aggregator</artifactId>
          <version>1.0.0</version>
          <relativePath>../parent/pom.xml</relativePath>
        </parent>
        <artifactId>consumer</artifactId>
      `),
    );
    await write(
      "parent/pom.xml",
      pomWith(`
        <groupId>com.example</groupId>
        <artifactId>aggregator</artifactId>
        <version>1.0.0</version>
      `),
    );

    await expect(
      assertNotMultiModule(path.join(root, "consumer")),
    ).rejects.toThrow(UnsupportedWorkspaceError);
  });
});

describe("detect", () => {
  it("is true when pom.xml is present", async () => {
    await writeInvoiceFixture();

    expect(await detect(root)).toBe(true);
  });

  it("is false for an empty directory", async () => {
    expect(await detect(root)).toBe(false);
  });
});

describe("regenerateClient", () => {
  const api = {
    name: "orders",
    kind: "internal" as const,
    source: {
      type: "openapi" as const,
      location: "../orders/openapi.json",
    },
    usedIn: ["src/main/java/com/schemenddemo/invoice"],
  };

  it("runs the generate-sources phase", async () => {
    await writeInvoiceFixture();
    let command = "";
    const exec = async (cmd: string) => {
      command = cmd;
      return { exitCode: 0, stdout: "", stderr: "" };
    };

    await regenerateClient({ root, exec }, api);

    expect(command).toBe("mvn -q -B generate-sources");
  });

  it("throws when generate-sources fails", async () => {
    await writeInvoiceFixture();
    const exec = async () => ({
      exitCode: 1,
      stdout: "",
      stderr: "schema not found",
    });

    await expect(regenerateClient({ root, exec }, api)).rejects.toThrow(
      /schema not found/,
    );
  });

  it("throws when no plugin execution matches the api's schema path", async () => {
    await writeInvoiceFixture();
    const otherApi = {
      ...api,
      source: { type: "openapi" as const, location: "../other/openapi.json" },
    };
    const exec = async () => ({ exitCode: 0, stdout: "", stderr: "" });

    await expect(regenerateClient({ root, exec }, otherApi)).rejects.toThrow(
      /no openapi-generator-maven-plugin execution/,
    );
  });

  it("does nothing for a non-openapi (external package) source", async () => {
    const packageApi = {
      name: "firebase",
      kind: "external" as const,
      source: {
        type: "package" as const,
        ecosystem: "maven" as const,
        name: "firebase",
        version: "9.0.0",
      },
      usedIn: [],
    };
    let called = false;
    const exec = async () => {
      called = true;
      return { exitCode: 0, stdout: "", stderr: "" };
    };

    await regenerateClient({ root, exec }, packageApi);

    expect(called).toBe(false);
  });
});

describe("assertDockerVisibility", () => {
  let repoRoot: string;
  let consumerRoot: string;

  function pomReferencing(inputSpec: string): string {
    return pomWith(`
  <groupId>com.schemenddemo</groupId>
  <artifactId>invoice-service</artifactId>
  <version>0.0.1-SNAPSHOT</version>
  <properties>
    <orders.openapi.spec>${inputSpec}</orders.openapi.spec>
  </properties>
  <build>
    <plugins>
      <plugin>
        <groupId>org.openapitools</groupId>
        <artifactId>openapi-generator-maven-plugin</artifactId>
        <executions>
          <execution>
            <configuration>
              <inputSpec>\${orders.openapi.spec}</inputSpec>
            </configuration>
          </execution>
        </executions>
      </plugin>
    </plugins>
  </build>
`);
  }

  async function writePom(inputSpec: string): Promise<void> {
    await writeFile(
      path.join(consumerRoot, "pom.xml"),
      pomReferencing(inputSpec),
    );
  }

  beforeEach(async () => {
    repoRoot = await mkdtemp(path.join(tmpdir(), "schemend-lang-java-repo-"));
    consumerRoot = path.join(repoRoot, "services", "invoice");
    await mkdir(consumerRoot, { recursive: true });
  });

  afterEach(async () => {
    await rm(repoRoot, { recursive: true, force: true });
  });

  it("passes when inputSpec resolves to a real file inside repoRoot", async () => {
    await mkdir(path.join(repoRoot, "services", "orders"), {
      recursive: true,
    });
    await writeFile(
      path.join(repoRoot, "services", "orders", "openapi.json"),
      "{}",
    );
    // biome-ignore lint/suspicious/noTemplateCurlyInString: fixture source text (Maven property syntax), not a real template literal.
    await writePom("${project.basedir}/../orders/openapi.json");

    await expect(
      assertDockerVisibility(consumerRoot, repoRoot),
    ).resolves.toBeUndefined();
  });

  it("does nothing when the pom has no openapi-generator-maven-plugin execution", async () => {
    await writeFile(
      path.join(consumerRoot, "pom.xml"),
      pomWith(`
  <groupId>com.schemenddemo</groupId>
  <artifactId>invoice-service</artifactId>
  <version>0.0.1-SNAPSHOT</version>
`),
    );

    await expect(
      assertDockerVisibility(consumerRoot, repoRoot),
    ).resolves.toBeUndefined();
  });

  it("throws when inputSpec resolves outside repoRoot", async () => {
    const outside = await mkdtemp(
      path.join(tmpdir(), "schemend-lang-java-outside-"),
    );
    try {
      const outsideFile = path.join(outside, "openapi.json");
      await writeFile(outsideFile, "{}");
      const relFromConsumer = path.relative(consumerRoot, outsideFile);
      await writePom(`\${project.basedir}/${relFromConsumer}`);

      await expect(
        assertDockerVisibility(consumerRoot, repoRoot),
      ).rejects.toThrow(/outside the repo root/);
    } finally {
      await rm(outside, { recursive: true, force: true });
    }
  });

  it("throws when inputSpec escapes repoRoot through a symlink", async () => {
    const outside = await mkdtemp(
      path.join(tmpdir(), "schemend-lang-java-outside-"),
    );
    try {
      await writeFile(path.join(outside, "real-openapi.json"), "{}");
      await mkdir(path.join(repoRoot, "services", "orders"), {
        recursive: true,
      });
      await symlink(
        path.join(outside, "real-openapi.json"),
        path.join(repoRoot, "services", "orders", "openapi.json"),
      );
      // biome-ignore lint/suspicious/noTemplateCurlyInString: fixture source text (Maven property syntax), not a real template literal.
      await writePom("${project.basedir}/../orders/openapi.json");

      await expect(
        assertDockerVisibility(consumerRoot, repoRoot),
      ).rejects.toThrow(/outside the repo root/);
    } finally {
      await rm(outside, { recursive: true, force: true });
    }
  });

  it("throws when inputSpec is a URL", async () => {
    await writePom("https://example.com/openapi.json");

    await expect(
      assertDockerVisibility(consumerRoot, repoRoot),
    ).rejects.toThrow(/URL/);
  });

  it("throws when inputSpec doesn't exist", async () => {
    // biome-ignore lint/suspicious/noTemplateCurlyInString: fixture source text (Maven property syntax), not a real template literal.
    await writePom("${project.basedir}/../orders/openapi.json");

    await expect(
      assertDockerVisibility(consumerRoot, repoRoot),
    ).rejects.toThrow(/doesn't exist/);
  });
});
