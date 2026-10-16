import { exec as execCallback } from "node:child_process";
import {
  mkdir,
  mkdtemp,
  readFile,
  realpath,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { CheckEvent, Config, Exec, ExecResult } from "@schemend/core";
import { dependencyVolumeName, runCheck } from "@schemend/core";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { csharpAdapter } from "./adapter.js";
import { resolveBuildTarget } from "./project.js";

function execIn(cwd: string): Exec {
  return (command) =>
    new Promise<ExecResult>((resolve) => {
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
  const result = await execIn(process.cwd())("docker info");
  return result.exitCode === 0;
}

const GIT_ENV = "-c user.email=a@b.c -c user.name=a -c commit.gpgsign=false";

const SCHEMA_BEFORE = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../../eval/scenarios/field-to-object/schema.before.json",
);
const SCHEMA_AFTER = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../../eval/scenarios/field-to-object/schema.after.json",
);

let repoRoot: string;
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

const ORDER_READER_CS = [
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
  // realpath'd because runCheck re-derives repoRoot via `git rev-parse --show-toplevel`
  // (fully resolved) - on macOS, mkdtemp's result sits under the unresolved /var symlink,
  // which would otherwise mismatch and misdirect ensureDockerCtx's mount.
  repoRoot = await realpath(
    await mkdtemp(path.join(tmpdir(), "schemend-lang-csharp-check-baseline-")),
  );
  consumerRoot = path.join(repoRoot, "apps", "consumer");

  await mkdir(path.join(repoRoot, "services", "orders"), { recursive: true });
  await writeFile(
    path.join(repoRoot, "services", "orders", "openapi.json"),
    await readFile(SCHEMA_BEFORE, "utf-8"),
  );
  await write("apps/consumer/src/Consumer/Consumer.csproj", MAIN_CSPROJ);
  await write("apps/consumer/src/Consumer/OrderReader.cs", ORDER_READER_CS);
  await write(
    "apps/consumer/tests/Consumer.Tests/Consumer.Tests.csproj",
    TEST_CSPROJ,
  );
  await write(
    "apps/consumer/tests/Consumer.Tests/OrderReaderTests.cs",
    ORDER_READER_TESTS_CS,
  );

  const exec = execIn(repoRoot);
  await exec(`git ${GIT_ENV} init -q`);
  await exec("git add -A");
  await exec(`git ${GIT_ENV} commit -q -m "old schema"`);

  // The commit a real CI trigger would fire on: the schema change already landed, hand-written
  // consumer code hasn't - exactly the single-phase state eval's own two-phase baseline (checkout
  // old ref, baseline, only then apply schemaAfter) never exercises.
  await writeFile(
    path.join(repoRoot, "services", "orders", "openapi.json"),
    await readFile(SCHEMA_AFTER, "utf-8"),
  );
  await exec("git add -A");
  await exec(`git ${GIT_ENV} commit -q -m "schema change"`);
});

afterEach(async () => {
  const target = await resolveBuildTarget(consumerRoot);
  const volume = await dependencyVolumeName(
    consumerRoot,
    path.join(consumerRoot, target.mainProject.path),
  );
  await execIn(consumerRoot)(`docker volume rm ${volume}`);
  await rm(repoRoot, { recursive: true, force: true });
});

function baseConfig(): Config {
  return {
    apis: [
      {
        name: "orders",
        schema: "../../services/orders/openapi.json",
        usedIn: ["src/Consumer"],
      },
    ],
    test: "dotnet test",
    platform: "github",
    budgetUsd: 1,
    models: { fix: "claude-sonnet-5", classify: "claude-haiku-4-5-20251001" },
  };
}

// Regression test: runCheck's baseline must see the schema as it stood BEFORE this change, not
// whatever's live on disk at HEAD - otherwise an adapter that always regenerates its client
// fresh (NSwag, like Java/Maven) sees the breaking schema immediately (see DECISIONS.md).
describe.runIf(await dockerAvailable())(
  "runCheck baseline + real csharpAdapter (single-phase schema change already at HEAD)",
  () => {
    it("baseline builds/tests cleanly against the pre-change schema, then restores the real file", async () => {
      const events: CheckEvent[] = [];
      const abortController = new AbortController();

      await runCheck({
        config: baseConfig(),
        root: consumerRoot,
        exec: execIn(consumerRoot),
        adapters: [csharpAdapter],
        abortController,
        onEvent: (event) => {
          events.push(event);
          if (
            event.type === "step-finished" &&
            event.step === "baseline" &&
            event.status === "passed"
          ) {
            // Stop right where runCheck itself checks for cancellation next (check.ts, right
            // after baseline) - proves the baseline fix without ever reaching regenerate/
            // impact/fix, so this test stays free and deterministic.
            abortController.abort();
          }
        },
      });

      const checkResults = events.filter((e) => e.type === "check-result");
      expect(checkResults).toHaveLength(2);
      expect(checkResults.every((e) => e.check.status === "passed")).toBe(true);
      expect(
        events.some(
          (e) => e.type === "step-started" && e.step === "regenerate",
        ),
      ).toBe(false);

      const restored = await readFile(
        path.join(repoRoot, "services", "orders", "openapi.json"),
        "utf-8",
      );
      expect(restored).toBe(await readFile(SCHEMA_AFTER, "utf-8"));
    }, 300_000);
  },
);
