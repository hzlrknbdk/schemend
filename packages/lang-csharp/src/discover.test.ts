import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import type { ApiEntry, Exec, ExecResult } from "@schemend/core";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  assertDockerVisibility,
  discoverApis,
  regenerateClient,
} from "./discover.js";

let repoRoot: string;
let root: string;

async function write(relPath: string, content: string): Promise<void> {
  const full = path.join(root, relPath);
  await mkdir(path.dirname(full), { recursive: true });
  await writeFile(full, content);
}

function mainCsproj(inputSpec = "../../../orders/openapi.json"): string {
  return `<Project Sdk="Microsoft.NET.Sdk.Web">
  <Target Name="GenerateOrdersClient" BeforeTargets="BeforeBuild">
    <Exec Command="$(NSwagExe_Net100) openapi2csclient /input:${inputSpec} /namespace:Notification.OrdersClient" />
  </Target>
</Project>`;
}

beforeEach(async () => {
  repoRoot = await mkdtemp(
    path.join(tmpdir(), "schemend-lang-csharp-discover-"),
  );
  root = path.join(repoRoot, "services/notification");
  await mkdir(path.join(repoRoot, "services/orders"), { recursive: true });
  await writeFile(path.join(repoRoot, "services/orders/openapi.json"), "{}");
});

afterEach(async () => {
  await rm(repoRoot, { recursive: true, force: true });
});

describe("discoverApis", () => {
  it("finds the API name, schema location and usedIn from the main project's NSwag target", async () => {
    await write("src/Notification/Notification.csproj", mainCsproj());
    await write(
      "src/Notification/Program.cs",
      'using Notification.OrdersClient;\n\nvar ordersApiUrl = Environment.GetEnvironmentVariable("ORDERS_API_URL");\n',
    );

    const entries = await discoverApis({
      root,
      exec: async () => ({ exitCode: 0, stdout: "", stderr: "" }),
    });

    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      name: "orders",
      kind: "internal",
      source: { type: "openapi", location: "../orders/openapi.json" },
      usedIn: ["src/Notification"],
    });
    expect(entries[0]?.evidence).toEqual(
      expect.arrayContaining([expect.stringContaining("env ORDERS_API_URL")]),
    );
  });
});

describe("regenerateClient", () => {
  const api: ApiEntry = {
    name: "orders",
    kind: "internal",
    source: { type: "openapi", location: "../orders/openapi.json" },
    usedIn: [],
  };

  it("runs the NSwag target directly, not a full build", async () => {
    await write("src/Notification/Notification.csproj", mainCsproj());
    const commands: string[] = [];
    const exec: Exec = async (command): Promise<ExecResult> => {
      commands.push(command);
      return { exitCode: 0, stdout: "", stderr: "" };
    };

    await regenerateClient({ root, exec }, api);

    expect(commands).toEqual([
      "dotnet build src/Notification/Notification.csproj --no-restore -t:GenerateOrdersClient",
    ]);
  });

  it("throws when the main project's schema doesn't match the given api", async () => {
    await write("src/Notification/Notification.csproj", mainCsproj());
    const mismatched: ApiEntry = {
      ...api,
      source: { type: "openapi", location: "../billing/openapi.json" },
    };

    await expect(
      regenerateClient(
        { root, exec: async () => ({ exitCode: 0, stdout: "", stderr: "" }) },
        mismatched,
      ),
    ).rejects.toThrow(/no NSwag/);
  });
});

describe("assertDockerVisibility", () => {
  it("passes for a schema that resolves inside repoRoot", async () => {
    await write("src/Notification/Notification.csproj", mainCsproj());

    await expect(
      assertDockerVisibility(root, repoRoot),
    ).resolves.toBeUndefined();
  });

  it("throws when the inputSpec is a URL", async () => {
    await write(
      "src/Notification/Notification.csproj",
      mainCsproj("https://schemas.example.com/orders/openapi.json"),
    );

    await expect(assertDockerVisibility(root, repoRoot)).rejects.toThrow(/URL/);
  });

  it("throws when the inputSpec doesn't exist", async () => {
    await write(
      "src/Notification/Notification.csproj",
      mainCsproj("../../../missing/openapi.json"),
    );

    await expect(assertDockerVisibility(root, repoRoot)).rejects.toThrow(
      /doesn't exist/,
    );
  });

  it("throws when the inputSpec resolves outside repoRoot", async () => {
    const outside = await mkdtemp(
      path.join(tmpdir(), "schemend-lang-csharp-outside-"),
    );
    try {
      await writeFile(path.join(outside, "openapi.json"), "{}");
      const relToOutside = path.relative(
        path.join(root, "src/Notification"),
        outside,
      );
      await write(
        "src/Notification/Notification.csproj",
        mainCsproj(`${relToOutside}/openapi.json`),
      );

      await expect(assertDockerVisibility(root, repoRoot)).rejects.toThrow(
        /outside the repo root/,
      );
    } finally {
      await rm(outside, { recursive: true, force: true });
    }
  });

  it("throws when the inputSpec escapes repoRoot via a symlink", async () => {
    const outside = await mkdtemp(
      path.join(tmpdir(), "schemend-lang-csharp-symlink-"),
    );
    try {
      await writeFile(path.join(outside, "openapi.json"), "{}");
      await symlink(
        path.join(outside, "openapi.json"),
        path.join(repoRoot, "services/orders/linked.json"),
      );
      await write(
        "src/Notification/Notification.csproj",
        mainCsproj("../../../orders/linked.json"),
      );

      await expect(assertDockerVisibility(root, repoRoot)).rejects.toThrow(
        /outside the repo root/,
      );
    } finally {
      await rm(outside, { recursive: true, force: true });
    }
  });
});
