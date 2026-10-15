import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import type { Exec, ExecResult } from "@schemend/core";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { build, test as runTest } from "./checks.js";

let root: string;

beforeEach(async () => {
  root = await mkdtemp(path.join(tmpdir(), "schemend-lang-java-checks-"));
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

function ok(stdout = ""): ExecResult {
  return { exitCode: 0, stdout, stderr: "" };
}

function failed(stderr: string, exitCode = 1): ExecResult {
  return { exitCode, stdout: "", stderr };
}

function failedBoth(stdout: string, stderr: string): ExecResult {
  return { exitCode: 1, stdout, stderr };
}

function recordingExec(commands: string[]): Exec {
  return async (cmd) => {
    commands.push(cmd);
    return ok();
  };
}

describe("build", () => {
  it("runs mvn test-compile and reports passed on exit 0", async () => {
    const commands: string[] = [];

    const result = await build({ root, exec: recordingExec(commands) });

    expect(commands).toEqual(["mvn -q -B test-compile"]);
    expect(result).toEqual({ name: "compile", status: "passed" });
  });

  it("reports failed with stderr as detail on a non-zero exit", async () => {
    const exec: Exec = async () =>
      failed("[ERROR] /x/Y.java:[1,1] cannot find symbol");

    const result = await build({ root, exec });

    expect(result.status).toBe("failed");
    expect(result.detail).toContain("cannot find symbol");
  });

  it("combines stdout and stderr on failure, instead of only using one", async () => {
    const exec: Exec = async () =>
      failedBoth(
        "[ERROR] cannot find symbol: method getTotalPrice()",
        "mkdir: cannot create directory '/root': Permission denied",
      );

    const result = await build({ root, exec });

    expect(result.status).toBe("failed");
    expect(result.detail).toContain("getTotalPrice");
    expect(result.detail).toContain("Permission denied");
  });

  it("truncates an overly long combined detail, keeping head and tail", async () => {
    const exec: Exec = async () =>
      failedBoth(`HEAD${"x".repeat(5000)}TAIL`, "");

    const result = await build({ root, exec });

    expect(result.detail?.length).toBeLessThan(5000);
    expect(result.detail).toContain("HEAD");
    expect(result.detail).toContain("TAIL");
    expect(result.detail).toContain("truncated");
  });
});

describe("test", () => {
  it("runs mvn test and reports passed on exit 0", async () => {
    const commands: string[] = [];

    const result = await runTest({ root, exec: recordingExec(commands) });

    expect(commands).toEqual(["mvn -q -B test"]);
    expect(result).toEqual({ name: "test", status: "passed" });
  });

  it("reports failed on a non-zero exit", async () => {
    const exec: Exec = async () => failed("1 test failed");

    const result = await runTest({ root, exec });

    expect(result.status).toBe("failed");
    expect(result.detail).toContain("1 test failed");
  });
});
