import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  detect,
  findCsProjects,
  requireResolvedNSwagConfig,
  resolveBuildTarget,
} from "./project.js";

let root: string;

async function write(relPath: string, content: string): Promise<void> {
  const full = path.join(root, relPath);
  await mkdir(path.dirname(full), { recursive: true });
  await writeFile(full, content);
}

function mainCsproj(inputSpec = "../../../orders/openapi.json"): string {
  return `<Project Sdk="Microsoft.NET.Sdk.Web">
  <PropertyGroup>
    <TargetFramework>net10.0</TargetFramework>
  </PropertyGroup>
  <ItemGroup>
    <PackageReference Include="NSwag.MSBuild" Version="14.7.1" />
  </ItemGroup>
  <Target Name="GenerateOrdersClient" BeforeTargets="BeforeBuild">
    <Exec Command="$(NSwagExe_Net100) openapi2csclient /input:${inputSpec} /classname:OrdersClient /namespace:Notification.OrdersClient /output:$(BaseIntermediateOutputPath)Generated/OrdersClient.cs" />
  </Target>
</Project>`;
}

const TEST_CSPROJ = `<Project Sdk="Microsoft.NET.Sdk">
  <PropertyGroup>
    <TargetFramework>net10.0</TargetFramework>
  </PropertyGroup>
  <ItemGroup>
    <PackageReference Include="Microsoft.NET.Test.Sdk" Version="17.14.1" />
  </ItemGroup>
  <ItemGroup>
    <ProjectReference Include="..\\..\\src\\Notification\\Notification.csproj" />
  </ItemGroup>
</Project>`;

beforeEach(async () => {
  root = await mkdtemp(path.join(tmpdir(), "schemend-lang-csharp-project-"));
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

describe("resolveBuildTarget", () => {
  it("targets the test project when no .sln exists, so building it also compiles the main project", async () => {
    await write("src/Notification/Notification.csproj", mainCsproj());
    await write(
      "tests/Notification.Tests/Notification.Tests.csproj",
      TEST_CSPROJ,
    );

    const target = await resolveBuildTarget(root);

    expect(target.commandPath).toBe(
      "tests/Notification.Tests/Notification.Tests.csproj",
    );
    expect(target.mainProject.path).toBe(
      "src/Notification/Notification.csproj",
    );
  });

  it("targets a .sln/.slnx directly at root over the test-project fallback", async () => {
    await write("src/Notification/Notification.csproj", mainCsproj());
    await write(
      "tests/Notification.Tests/Notification.Tests.csproj",
      TEST_CSPROJ,
    );
    await write("Notification.sln", "");

    const target = await resolveBuildTarget(root);

    expect(target.commandPath).toBe("Notification.sln");
  });

  it("falls back to the main project alone when there is no test project", async () => {
    await write("src/Notification/Notification.csproj", mainCsproj());

    const target = await resolveBuildTarget(root);

    expect(target.commandPath).toBe("src/Notification/Notification.csproj");
  });

  it("throws instead of guessing when more than one project declares an NSwag Exec target", async () => {
    await write("a/A.csproj", mainCsproj());
    await write("b/B.csproj", mainCsproj());

    await expect(resolveBuildTarget(root)).rejects.toThrow(
      /multiple .csproj files/,
    );
  });

  it("throws instead of guessing when more than one test project exists with no .sln to disambiguate", async () => {
    await write("src/Notification/Notification.csproj", mainCsproj());
    await write("tests/A.Tests/A.Tests.csproj", TEST_CSPROJ);
    await write("tests/B.Tests/B.Tests.csproj", TEST_CSPROJ);

    await expect(resolveBuildTarget(root)).rejects.toThrow(
      /multiple test projects/,
    );
  });

  it("throws when no project declares an NSwag Exec target", async () => {
    await write("src/Notification/Notification.csproj", TEST_CSPROJ);

    await expect(resolveBuildTarget(root)).rejects.toThrow(/no NSwag/);
  });

  it("resolves the main project's inputSpec relative to root, not the project's own nested directory", async () => {
    await write("src/Notification/Notification.csproj", mainCsproj());
    await mkdir(path.join(path.dirname(root), "orders"), { recursive: true });

    const target = await resolveBuildTarget(root);

    expect(target.mainProject.nswag?.inputSpec).toBe("../orders/openapi.json");
  });

  it("resolves $(Prop) tokens from the project's own PropertyGroup", async () => {
    const csproj = `<Project Sdk="Microsoft.NET.Sdk.Web">
  <PropertyGroup>
    <OrdersSchemaPath>../../../orders/openapi.json</OrdersSchemaPath>
  </PropertyGroup>
  <Target Name="GenerateOrdersClient" BeforeTargets="BeforeBuild">
    <Exec Command="$(NSwagExe_Net100) openapi2csclient /input:$(OrdersSchemaPath) /namespace:Notification.OrdersClient" />
  </Target>
</Project>`;
    await write("src/Notification/Notification.csproj", csproj);

    const target = await resolveBuildTarget(root);

    expect(target.mainProject.nswag?.unresolvedInputSpec).toBe(false);
    expect(target.mainProject.nswag?.inputSpec).toBe("../orders/openapi.json");
  });

  it("flags an inputSpec that still contains an unresolved $(Prop) token instead of guessing", async () => {
    const csproj = `<Project Sdk="Microsoft.NET.Sdk.Web">
  <Target Name="GenerateOrdersClient" BeforeTargets="BeforeBuild">
    <Exec Command="$(NSwagExe_Net100) openapi2csclient /input:$(UndeclaredSchemaPath) /namespace:Notification.OrdersClient" />
  </Target>
</Project>`;
    await write("src/Notification/Notification.csproj", csproj);

    const target = await resolveBuildTarget(root);

    expect(target.mainProject.nswag?.unresolvedInputSpec).toBe(true);
    expect(() => requireResolvedNSwagConfig(target.mainProject)).toThrow(
      /unresolved/,
    );
  });

  it("handles a quoted /input value", async () => {
    const csproj = `<Project Sdk="Microsoft.NET.Sdk.Web">
  <Target Name="GenerateOrdersClient" BeforeTargets="BeforeBuild">
    <Exec Command='$(NSwagExe_Net100) openapi2csclient /input:"../../../orders/openapi.json" /namespace:Notification.OrdersClient' />
  </Target>
</Project>`;
    await write("src/Notification/Notification.csproj", csproj);

    const target = await resolveBuildTarget(root);

    expect(target.mainProject.nswag?.inputSpec).toBe("../orders/openapi.json");
  });

  it("skips bin/obj when scanning for .csproj files", async () => {
    await write("src/Notification/Notification.csproj", mainCsproj());
    await write(
      "src/Notification/obj/Generated/OrdersClient.csproj",
      mainCsproj(),
    );

    const projects = await findCsProjects(root);

    expect(projects).toHaveLength(1);
  });
});

describe("detect", () => {
  it("returns true when a .csproj declares an NSwag Exec target", async () => {
    await write("src/Notification/Notification.csproj", mainCsproj());

    expect(await detect(root)).toBe(true);
  });

  it("returns false when no .csproj declares one, without throwing", async () => {
    await write("src/Notification/Notification.csproj", TEST_CSPROJ);

    expect(await detect(root)).toBe(false);
  });

  it("returns false (not throw) even when the layout is ambiguous", async () => {
    await write("a/A.csproj", mainCsproj());
    await write("b/B.csproj", mainCsproj());

    expect(await detect(root)).toBe(true);
  });
});
