import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import type { ApiChange, ApiEntry } from "@schemend/core";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { findAffected } from "./impact.js";

let repoRoot: string;
let root: string;

async function write(relPath: string, content: string): Promise<void> {
  const full = path.join(root, relPath);
  await mkdir(path.dirname(full), { recursive: true });
  await writeFile(full, content);
}

async function writeMainProject(): Promise<void> {
  await write(
    "src/Notification/Notification.csproj",
    `<Project Sdk="Microsoft.NET.Sdk.Web">
  <Target Name="GenerateOrdersClient" BeforeTargets="BeforeBuild">
    <Exec Command="$(NSwagExe_Net100) openapi2csclient /input:../../../orders/openapi.json /namespace:Notification.OrdersClient" />
  </Target>
</Project>`,
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
  repoRoot = await mkdtemp(path.join(tmpdir(), "schemend-lang-csharp-impact-"));
  root = path.join(repoRoot, "services/notification");
  await mkdir(root, { recursive: true });
});

afterEach(async () => {
  await rm(repoRoot, { recursive: true, force: true });
});

// A single error (PascalCase property) printed once inline, then repeated verbatim in dotnet
// build's end-of-build summary - the real shape findAffected's dedup has to collapse to one.
function buildOutput(): string {
  const line =
    "/workspace/services/notification/src/Notification/ReceiptFormatter.cs(7,34): " +
    "error CS1061: 'Order' does not contain a definition for 'TotalPrice' " +
    "[/workspace/services/notification/src/Notification/Notification.csproj]";
  return [
    "Build started...",
    line,
    "Build FAILED.",
    "",
    line,
    "",
    "    0 Warning(s)",
    "    1 Error(s)",
  ].join("\n");
}

describe("findAffected", () => {
  it("finds the line using a removed property and attributes it to the matching change, deduplicating the repeated summary line", async () => {
    await writeMainProject();
    await write(
      "src/Notification/ReceiptFormatter.cs",
      [
        "namespace Notification;",
        "",
        "public static class ReceiptFormatter",
        "{",
        "  public static string Format(Order order)",
        "  {",
        "    return order.TotalPrice.ToString();",
        "  }",
        "}",
        "",
      ].join("\n"),
    );
    const output = buildOutput();
    const exec = async () => ({ exitCode: 1, stdout: output, stderr: "" });

    const locations = await findAffected({ root, repoRoot, exec }, api, [
      totalPriceRemoved,
    ]);

    expect(locations).toHaveLength(1);
    expect(locations[0]).toMatchObject({
      file: "src/Notification/ReceiptFormatter.cs",
      line: 7,
      changeId: totalPriceRemoved.id,
    });
    expect(locations[0]?.snippet).toContain("TotalPrice");
  });

  it("drops diagnostics that don't match any change instead of guessing", async () => {
    await writeMainProject();
    const unrelatedChange: ApiChange = {
      id: "unrelated#0",
      severity: "breaking",
      summary: "removed the required property `warehouseId` from the request",
      target: "POST /orders",
      source: { tool: "oasdiff", id: "request-property-removed", level: 2 },
    };
    const exec = async () => ({
      exitCode: 1,
      stdout: buildOutput(),
      stderr: "",
    });

    const locations = await findAffected({ root, repoRoot, exec }, api, [
      unrelatedChange,
    ]);

    expect(locations).toEqual([]);
  });

  it("does not match a bare substring that merely shares the field's name (word boundary)", async () => {
    await writeMainProject();
    const output =
      "/workspace/services/notification/src/Notification/X.cs(1,1): error CS1061: " +
      "'Order' does not contain a definition for 'TotalPriceWithTax' [/workspace/.../Notification.csproj]";
    const exec = async () => ({ exitCode: 1, stdout: output, stderr: "" });

    const locations = await findAffected({ root, repoRoot, exec }, api, [
      totalPriceRemoved,
    ]);

    expect(locations).toEqual([]);
  });

  it("returns an empty list when the build passes", async () => {
    await writeMainProject();
    const exec = async () => ({ exitCode: 0, stdout: "", stderr: "" });

    const locations = await findAffected({ root, repoRoot, exec }, api, [
      totalPriceRemoved,
    ]);

    expect(locations).toEqual([]);
  });
});
