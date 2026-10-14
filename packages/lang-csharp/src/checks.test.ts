import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import type { Exec, ExecResult } from "@schemend/core";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { build, test } from "./checks.js";

let root: string;

async function write(relPath: string, content: string): Promise<void> {
  const full = path.join(root, relPath);
  await mkdir(path.dirname(full), { recursive: true });
  await writeFile(full, content);
}

const MAIN_CSPROJ = `<Project Sdk="Microsoft.NET.Sdk.Web">
  <Target Name="GenerateOrdersClient" BeforeTargets="BeforeBuild">
    <Exec Command="$(NSwagExe_Net100) openapi2csclient /input:../../../orders/openapi.json /namespace:Notification.OrdersClient" />
  </Target>
</Project>`;

const TEST_CSPROJ = `<Project Sdk="Microsoft.NET.Sdk">
  <ItemGroup>
    <PackageReference Include="Microsoft.NET.Test.Sdk" Version="17.14.1" />
  </ItemGroup>
</Project>`;

beforeEach(async () => {
  root = await mkdtemp(path.join(tmpdir(), "schemend-lang-csharp-checks-"));
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

function recordingExec(commands: string[], exitCode = 0): Exec {
  return async (command): Promise<ExecResult> => {
    commands.push(command);
    return { exitCode, stdout: "", stderr: exitCode === 0 ? "" : "boom" };
  };
}

describe("build", () => {
  it("targets the test project (so it also compiles the main project), with --no-restore", async () => {
    await write("src/Notification/Notification.csproj", MAIN_CSPROJ);
    await write(
      "tests/Notification.Tests/Notification.Tests.csproj",
      TEST_CSPROJ,
    );
    const commands: string[] = [];

    const result = await build({ root, exec: recordingExec(commands) });

    expect(commands).toEqual([
      "dotnet build tests/Notification.Tests/Notification.Tests.csproj --no-restore",
    ]);
    expect(result).toEqual({ name: "build", status: "passed" });
  });

  it("reports a failure with the exec's stderr as detail", async () => {
    await write("src/Notification/Notification.csproj", MAIN_CSPROJ);
    const commands: string[] = [];

    const result = await build({ root, exec: recordingExec(commands, 1) });

    expect(result).toEqual({ name: "build", status: "failed", detail: "boom" });
  });
});

describe("test", () => {
  it("targets the same resolved build target, with --no-restore", async () => {
    await write("src/Notification/Notification.csproj", MAIN_CSPROJ);
    const commands: string[] = [];

    const result = await test({ root, exec: recordingExec(commands) });

    expect(commands).toEqual([
      "dotnet test src/Notification/Notification.csproj --no-restore",
    ]);
    expect(result).toEqual({ name: "test", status: "passed" });
  });
});
