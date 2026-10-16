import { exec as execCallback } from "node:child_process";
import {
  access,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { ExecResult } from "@schemend/core";
import { dependencyVolumeName, ensureDockerCtx } from "@schemend/core";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { csharpAdapter } from "./adapter.js";
import { resolveBuildTarget } from "./project.js";

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

async function fileExists(p: string): Promise<boolean> {
  try {
    await access(p);
    return true;
  } catch {
    return false;
  }
}

const GIT_ENV = "-c user.email=a@b.c -c user.name=a -c commit.gpgsign=false";

const SCHEMA_BEFORE = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../../eval/scenarios/field-to-object/schema.before.json",
);

let repoRoot: string;
// Two directories above the consumer, same as lang-java's equivalent test, plus one more
// nesting level inside it for the .csproj itself (C#'s src/+tests/ layout).
let consumerRoot: string;

async function write(relPath: string, content: string): Promise<void> {
  const full = path.join(repoRoot, relPath);
  await mkdir(path.dirname(full), { recursive: true });
  await writeFile(full, content);
}

const MAIN_CSPROJ = `<Project Sdk="Microsoft.NET.Sdk">
  <PropertyGroup>
    <TargetFramework>net10.0</TargetFramework>
    <Nullable>enable</Nullable>
  </PropertyGroup>
  <ItemGroup>
    <!-- The generated client itself uses Newtonsoft.Json (NSwag's default serializer) - a real
         dependency of the GENERATED CODE, not something NSwag.MSBuild pulls in transitively for
         the consuming project (same as services/notification/src/Notification/Notification.csproj). -->
    <PackageReference Include="Newtonsoft.Json" Version="13.0.4" />
    <PackageReference Include="NSwag.MSBuild" Version="14.7.1">
      <IncludeAssets>runtime; build; native; contentfiles; analyzers; buildtransitive</IncludeAssets>
      <PrivateAssets>all</PrivateAssets>
    </PackageReference>
  </ItemGroup>
  <Target Name="GenerateOrdersClient" BeforeTargets="BeforeBuild">
    <MakeDir Directories="$(BaseIntermediateOutputPath)Generated" />
    <Exec Command="$(NSwagExe_Net100) openapi2csclient /input:../../../../services/orders/openapi.json /classname:OrdersClient /namespace:Consumer.OrdersClient /GenerateClientInterfaces:true /output:$(BaseIntermediateOutputPath)Generated/OrdersClient.cs" />
  </Target>
  <Target Name="IncludeGeneratedOrdersClient" AfterTargets="GenerateOrdersClient" BeforeTargets="CoreCompile">
    <ItemGroup>
      <Compile Include="$(BaseIntermediateOutputPath)Generated/**/*.cs" />
    </ItemGroup>
  </Target>
</Project>`;

const TEST_CSPROJ = `<Project Sdk="Microsoft.NET.Sdk">
  <PropertyGroup>
    <TargetFramework>net10.0</TargetFramework>
    <Nullable>enable</Nullable>
    <IsPackable>false</IsPackable>
  </PropertyGroup>
  <ItemGroup>
    <PackageReference Include="Microsoft.NET.Test.Sdk" Version="17.14.1" />
    <PackageReference Include="xunit" Version="2.9.3" />
    <PackageReference Include="xunit.runner.visualstudio" Version="3.1.4" />
  </ItemGroup>
  <ItemGroup>
    <ProjectReference Include="../../src/Consumer/Consumer.csproj" />
  </ItemGroup>
</Project>`;

function orderReaderCs(): string {
  return [
    "namespace Consumer;",
    "",
    "using Consumer.OrdersClient;",
    "",
    "public static class OrderReader",
    "{",
    "  public static double Total(Order order) => order.TotalPrice;",
    "}",
    "",
  ].join("\n");
}

const ORDER_READER_TESTS_CS = [
  "namespace Consumer;",
  "",
  "using Consumer.OrdersClient;",
  "using Xunit;",
  "",
  "public class OrderReaderTests",
  "{",
  "  [Fact]",
  "  public void ReadsTheTotal()",
  "  {",
  "    var order = new Order { TotalPrice = 2499.9 };",
  "    Assert.Equal(2499.9, OrderReader.Total(order));",
  "  }",
  "}",
  "",
].join("\n");

beforeEach(async () => {
  repoRoot = await mkdtemp(
    path.join(tmpdir(), "schemend-lang-csharp-docker-visibility-"),
  );
  consumerRoot = path.join(repoRoot, "apps", "consumer");

  await mkdir(path.join(repoRoot, "services", "orders"), { recursive: true });
  await writeFile(
    path.join(repoRoot, "services", "orders", "openapi.json"),
    await readFile(SCHEMA_BEFORE, "utf-8"),
  );

  await write("apps/consumer/src/Consumer/Consumer.csproj", MAIN_CSPROJ);
  await write("apps/consumer/src/Consumer/OrderReader.cs", orderReaderCs());
  await write(
    "apps/consumer/tests/Consumer.Tests/Consumer.Tests.csproj",
    TEST_CSPROJ,
  );
  await write(
    "apps/consumer/tests/Consumer.Tests/OrderReaderTests.cs",
    ORDER_READER_TESTS_CS,
  );

  await realExec(`git ${GIT_ENV} init -q`, repoRoot);
});

afterEach(async () => {
  const target = await resolveBuildTarget(consumerRoot);
  const volume = await dependencyVolumeName(
    consumerRoot,
    path.join(consumerRoot, target.mainProject.path),
  );
  await realExec(`docker volume rm ${volume}`);
  await rm(repoRoot, { recursive: true, force: true });
});

// Mirrors lang-java's docker-visibility.integration.test.ts: the first real exercise of
// ensureDockerCtx/ensureContainerDeps for this adapter (unit tests fake ctx.exec entirely).
describe.runIf(await dockerAvailable())(
  "ensureDockerCtx + csharpAdapter.build/test (real Docker, real dotnet/NSwag)",
  () => {
    it("builds and tests cleanly when the schema is two directories above the consumer, and restore alone never triggers the NSwag target", async () => {
      const { ctx } = await ensureDockerCtx(
        csharpAdapter,
        consumerRoot,
        repoRoot,
        (command) => realExec(command),
        undefined,
        undefined,
      );

      const generatedClientPath = path.join(
        consumerRoot,
        "src/Consumer/obj/Generated/OrdersClient.cs",
      );
      // `dotnet restore` runs the Restore target graph, never the Build graph NSwag's
      // BeforeTargets="BeforeBuild" hooks into - only a real `dotnet build` produces this file.
      expect(await fileExists(generatedClientPath)).toBe(false);

      const buildResult = await csharpAdapter.build(ctx);
      expect(buildResult).toEqual({ name: "build", status: "passed" });
      expect(await fileExists(generatedClientPath)).toBe(true);

      const testResult = await csharpAdapter.test(ctx);
      expect(testResult).toEqual({ name: "test", status: "passed" });
    }, 300_000);

    it("doesn't throw from ensureDockerCtx when the baseline itself doesn't compile - adapter.build reports the failure instead of install crashing", async () => {
      await write(
        "apps/consumer/src/Consumer/OrderReader.cs",
        [
          "namespace Consumer;",
          "",
          "public static class OrderReader",
          "{",
          "  public static double Total(object order) => ThisMethodDoesNotExist(order);",
          "}",
          "",
        ].join("\n"),
      );

      const { ctx } = await ensureDockerCtx(
        csharpAdapter,
        consumerRoot,
        repoRoot,
        (command) => realExec(command),
        undefined,
        undefined,
      );

      const buildResult = await csharpAdapter.build(ctx);
      expect(buildResult.status).toBe("failed");
      expect(buildResult.detail).toContain("ThisMethodDoesNotExist");
    }, 300_000);
  },
);
