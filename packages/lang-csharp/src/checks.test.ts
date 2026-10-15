import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import type { Exec, ExecResult } from "@schemend/core";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  build,
  summarizeBuildFailure,
  summarizeTestResult,
  test,
} from "./checks.js";

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

function failingExec(stdout: string, stderr: string): Exec {
  return async () => ({ exitCode: 1, stdout, stderr });
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

  it("combines stdout and stderr on failure, instead of only using one", async () => {
    await write("src/Notification/Notification.csproj", MAIN_CSPROJ);
    const exec = failingExec(
      "error CS1061: 'Order' does not contain a definition for 'TotalPrice'",
      "An issue was encountered verifying workloads.",
    );

    const result = await build({ root, exec });

    expect(result.status).toBe("failed");
    expect(result.detail).toContain("CS1061");
    expect(result.detail).toContain("verifying workloads");
  });

  it("truncates an overly long combined detail, keeping head and tail", async () => {
    await write("src/Notification/Notification.csproj", MAIN_CSPROJ);
    const exec = failingExec(`HEAD${"x".repeat(5000)}TAIL`, "");

    const result = await build({ root, exec });

    expect(result.detail?.length).toBeLessThan(5000);
    expect(result.detail).toContain("HEAD");
    expect(result.detail).toContain("TAIL");
    expect(result.detail).toContain("truncated");
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

// Real `dotnet build` output (same shape impact.ts's own ERROR_LINE_RE parses): the same error
// repeats once inline, once in the "Build FAILED" summary.
const REAL_BUILD_FAILURE = [
  "/workspace/services/notification/src/Notification/Program.cs(20,44): error CS1061: 'Order' does not contain a definition for 'TotalPrice' [/workspace/services/notification/src/Notification/Notification.csproj]",
  "",
  "Build FAILED.",
  "",
  "/workspace/services/notification/src/Notification/Program.cs(20,44): error CS1061: 'Order' does not contain a definition for 'TotalPrice' [/workspace/services/notification/src/Notification/Notification.csproj]",
  "    0 Warning(s)",
  "    1 Error(s)",
].join("\n");

// Real `dotnet test` output against a deliberately broken assertion.
const REAL_TEST_FAILURE = [
  "Test run for /workspace/services/notification/tests/Notification.Tests/bin/Debug/net10.0/Notification.Tests.dll (.NETCoreApp,Version=v10.0)",
  "  Failed Notification.Tests.ReceiptFormatterTests.FormatsTheTotalWithTheHardcodedTlSuffix [4 ms]",
  "  Error Message:",
  "   Assert.Equal() Failure: Strings differ",
  "Failed!  - Failed:     1, Passed:     1, Skipped:     0, Total:     2, Duration: 182 ms - Notification.Tests.dll (net10.0)",
].join("\n");

describe("summarizeBuildFailure", () => {
  it("counts distinct file:line:code errors (not raw line repeats) and reports the first", () => {
    const result = {
      name: "build",
      status: "failed" as const,
      detail: REAL_BUILD_FAILURE,
    };

    expect(summarizeBuildFailure(result)).toEqual({
      errorCount: 1,
      firstError:
        "CS1061: 'Order' does not contain a definition for 'TotalPrice'",
    });
  });

  it("returns {} when nothing looks like an MSBuild error", () => {
    expect(
      summarizeBuildFailure({
        name: "build",
        status: "failed" as const,
        detail: "some other tool's output",
      }),
    ).toEqual({});
  });
});

describe("summarizeTestResult", () => {
  it("parses dotnet test's summary line and first failure marker", () => {
    const result = {
      name: "test",
      status: "failed" as const,
      detail: REAL_TEST_FAILURE,
    };

    expect(summarizeTestResult(result)).toEqual({
      passed: 1,
      failed: 1,
      firstFailure:
        "Notification.Tests.ReceiptFormatterTests.FormatsTheTotalWithTheHardcodedTlSuffix",
    });
  });
});
