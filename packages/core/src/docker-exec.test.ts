import { execSync } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Exec, ExecResult } from "./context.js";
import {
  assertStandaloneProject,
  chownDependencyVolume,
  createDockerExec,
  dependencyVolumeName,
  ensureContainerDeps,
  ensureDockerImage,
  pruneStaleDependencyVolumes,
  UnsupportedWorkspaceError,
} from "./docker-exec.js";

function ok(stdout: string): ExecResult {
  return { exitCode: 0, stdout, stderr: "" };
}

function failed(stderr: string, exitCode = 1): ExecResult {
  return { exitCode, stdout: "", stderr };
}

function deferred<T>(): { promise: Promise<T>; resolve: (value: T) => void } {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

describe("createDockerExec", () => {
  it("wraps the command to run inside the image, root mounted, given network mode", async () => {
    const hostExec = vi.fn(async (command: string) => ok(command));
    const dockerExec = createDockerExec(
      hostExec,
      "/Users/x/project",
      "my-image:1",
      {
        network: "none",
        volumes: { "schemend-deps-abc": "/workspace/node_modules" },
      },
    );

    const result = await dockerExec("pnpm test");

    expect(result.stdout).toContain("docker run --rm");
    expect(result.stdout).toContain("--network none");
    expect(result.stdout).toContain("-v '/Users/x/project:/workspace'");
    expect(result.stdout).toContain(
      "-v 'schemend-deps-abc:/workspace/node_modules'",
    );
    expect(result.stdout).toContain("-w /workspace");
    expect(result.stdout).toContain("my-image:1");
    expect(result.stdout).toContain("sh -c 'pnpm test'");
  });

  it("shell-escapes the command so a real shell reconstructs it exactly", async () => {
    const hostExec = vi.fn(async (command: string) => ok(command));
    const dockerExec = createDockerExec(hostExec, "/root", "image", {
      network: "none",
    });

    const original = "echo 'hi there' && echo \"done\"";
    const result = await dockerExec(original);

    const shArg = result.stdout.match(/sh -c (.*)$/)?.[1];
    expect(shArg).toBeDefined();

    // Round-trip through a real shell instead of hand-matching an escaped string: printf
    // receives the quoted argument as a single token and echoes its literal content back.
    const reconstructed = execSync(`printf '%s' ${shArg}`, {
      encoding: "utf-8",
    });
    expect(reconstructed).toBe(original);
  });

  it("gives each call its own container name", async () => {
    const seen: string[] = [];
    const hostExec = vi.fn(async (command: string) => {
      const name = command.match(/--name (\S+)/)?.[1];
      if (name) seen.push(name);
      return ok("");
    });
    const dockerExec = createDockerExec(hostExec, "/root", "image", {
      network: "none",
    });

    await dockerExec("pnpm test");
    await dockerExec("pnpm test");

    expect(seen).toHaveLength(2);
    expect(seen[0]).not.toBe(seen[1]);
  });

  it("kills the running container by name when aborted mid-call", async () => {
    const calls: string[] = [];
    const pending = deferred<ExecResult>();
    const hostExec: Exec = vi.fn(async (command: string) => {
      calls.push(command);
      if (command.startsWith("docker kill")) return ok("");
      return pending.promise;
    });

    const abortController = new AbortController();
    const dockerExec = createDockerExec(hostExec, "/root", "image", {
      network: "none",
      abortController,
    });

    const resultPromise = dockerExec("pnpm test");
    await Promise.resolve();
    await Promise.resolve();
    abortController.abort();
    await Promise.resolve();
    await Promise.resolve();

    const runCommand = calls.find((c) => c.includes("docker run"));
    const name = runCommand?.match(/--name (\S+)/)?.[1];
    expect(name).toBeDefined();
    expect(calls).toContain(`docker kill ${name}`);

    pending.resolve(failed("killed", 137));
    await resultPromise;
  });

  it("does not kill anything once the command already finished", async () => {
    const calls: string[] = [];
    const hostExec: Exec = vi.fn(async (command: string) => {
      calls.push(command);
      return ok("");
    });
    const abortController = new AbortController();
    const dockerExec = createDockerExec(hostExec, "/root", "image", {
      network: "none",
      abortController,
    });

    await dockerExec("pnpm test");
    abortController.abort();
    await Promise.resolve();

    expect(calls.some((c) => c.startsWith("docker kill"))).toBe(false);
  });

  it("runs as the given uid/gid with a writable HOME, when a user is set", async () => {
    const hostExec = vi.fn(async (command: string) => ok(command));
    const dockerExec = createDockerExec(hostExec, "/root", "image", {
      network: "none",
      user: { uid: 1001, gid: 1001 },
    });

    const result = await dockerExec("pnpm test");

    expect(result.stdout).toContain("--user 1001:1001");
    expect(result.stdout).toContain("-e HOME=/tmp");
  });

  it("omits --user entirely when no user is given", async () => {
    const hostExec = vi.fn(async (command: string) => ok(command));
    const dockerExec = createDockerExec(hostExec, "/root", "image", {
      network: "none",
    });

    const result = await dockerExec("pnpm test");

    expect(result.stdout).not.toContain("--user");
    expect(result.stdout).not.toContain("HOME");
  });
});

describe("ensureDockerImage", () => {
  it("does nothing if the image already exists locally", async () => {
    const exec = vi.fn(async () => ok(""));
    await ensureDockerImage(exec, "my-image");
    expect(exec).toHaveBeenCalledTimes(1);
    expect(exec).toHaveBeenCalledWith(
      expect.stringContaining("docker image inspect"),
    );
  });

  it("builds the image from the given Dockerfile if it's missing", async () => {
    const exec = vi.fn(async (command: string) =>
      command.includes("inspect") ? failed("no such image") : ok(""),
    );
    await ensureDockerImage(exec, "my-image", "/pkg/docker/Dockerfile");
    expect(exec).toHaveBeenCalledWith(expect.stringContaining("docker build"));
    expect(exec).toHaveBeenCalledWith(
      expect.stringContaining("-f '/pkg/docker/Dockerfile'"),
    );
  });

  it("does nothing if missing and no Dockerfile was given", async () => {
    const exec = vi.fn(async () => failed("no such image"));
    await ensureDockerImage(exec, "my-image");
    expect(exec).toHaveBeenCalledTimes(1);
  });

  it("throws a clear error if the build fails", async () => {
    const exec = vi.fn(async (command: string) =>
      command.includes("inspect")
        ? failed("no such image")
        : failed("build boom"),
    );
    await expect(
      ensureDockerImage(exec, "my-image", "/pkg/docker/Dockerfile"),
    ).rejects.toThrow(/failed to build Docker image my-image/);
  });
});

describe("ensureContainerDeps", () => {
  it("installs with network access into the given volume", async () => {
    const exec = vi.fn(async () => ok(""));
    await ensureContainerDeps({
      exec,
      root: "/r",
      image: "img",
      volume: "vol",
      volumeTarget: "/workspace/node_modules",
      installCommand: "pnpm install --frozen-lockfile",
    });
    expect(exec).toHaveBeenCalledWith(
      expect.stringContaining("--network bridge"),
    );
    expect(exec).toHaveBeenCalledWith(
      expect.stringContaining("-v 'vol:/workspace/node_modules'"),
    );
    expect(exec).toHaveBeenCalledWith(
      expect.stringContaining("pnpm install --frozen-lockfile"),
    );
  });

  it("throws a clear error if install fails", async () => {
    const exec = vi.fn(async () => failed("network unreachable"));
    await expect(
      ensureContainerDeps({
        exec,
        root: "/r",
        image: "img",
        volume: "vol",
        volumeTarget: "/x",
        installCommand: "pnpm install",
      }),
    ).rejects.toThrow(/failed to install dependencies in Docker/);
  });

  it("runs as the given user when one is passed", async () => {
    const exec = vi.fn(async (command: string) => ok(command));
    await ensureContainerDeps({
      exec,
      root: "/r",
      image: "img",
      volume: "vol",
      volumeTarget: "/x",
      installCommand: "pnpm install",
      user: { uid: 1001, gid: 1001 },
    });
    expect(exec).toHaveBeenCalledWith(
      expect.stringContaining("--user 1001:1001"),
    );
  });
});

describe("chownDependencyVolume", () => {
  it("chowns the volume's mount point to the given user, as root, no network", async () => {
    const exec = vi.fn(async (command: string) => ok(command));
    await chownDependencyVolume(exec, "img", "vol", "/workspace/node_modules", {
      uid: 1001,
      gid: 1001,
    });

    const command = exec.mock.calls[0]?.[0] as string;
    expect(command).toContain("--network none");
    expect(command).not.toContain("--user");
    expect(command).toContain("-v 'vol:/workspace/node_modules'");
    expect(command).toContain("chown 1001:1001 /workspace/node_modules");
  });

  it("throws a clear error if chown fails", async () => {
    const exec = vi.fn(async () => failed("permission denied"));
    await expect(
      chownDependencyVolume(exec, "img", "vol", "/x", { uid: 1, gid: 1 }),
    ).rejects.toThrow(/failed to chown dependency volume vol/);
  });
});

describe("dependencyVolumeName", () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(path.join(tmpdir(), "schemend-depvol-"));
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("is deterministic for the same root and lockfile content", async () => {
    const lockfile = path.join(dir, "pnpm-lock.yaml");
    await writeFile(lockfile, "lockfile v1");

    const a = await dependencyVolumeName(dir, lockfile);
    const b = await dependencyVolumeName(dir, lockfile);

    expect(a).toBe(b);
    expect(a).toMatch(/^schemend-deps-[0-9a-f]{12}-[0-9a-f]{12}-v\d+$/);
  });

  it("changes when the lockfile content changes, keeping the same project prefix", async () => {
    const lockfile = path.join(dir, "pnpm-lock.yaml");
    await writeFile(lockfile, "lockfile v1");
    const before = await dependencyVolumeName(dir, lockfile);

    await writeFile(lockfile, "lockfile v2");
    const after = await dependencyVolumeName(dir, lockfile);

    expect(before).not.toBe(after);
    const projectPrefix = before.split("-").slice(0, 3).join("-");
    expect(after.startsWith(projectPrefix)).toBe(true);
  });

  it("rejects when the lockfile doesn't exist (assertStandaloneProject is the boundary check)", async () => {
    const missing = path.join(dir, "pnpm-lock.yaml");
    await expect(dependencyVolumeName(dir, missing)).rejects.toThrow();
  });
});

describe("assertStandaloneProject", () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(path.join(tmpdir(), "schemend-standalone-"));
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("passes when the lockfile exists and no workspace marker is found above root", async () => {
    await writeFile(path.join(dir, "pnpm-lock.yaml"), "");
    await expect(
      assertStandaloneProject(dir, "pnpm-lock.yaml", ["pnpm-workspace.yaml"]),
    ).resolves.toBeUndefined();
  });

  it("throws a clear error when the lockfile is missing", async () => {
    await expect(
      assertStandaloneProject(dir, "pnpm-lock.yaml", ["pnpm-workspace.yaml"]),
    ).rejects.toThrow(UnsupportedWorkspaceError);
  });

  it("throws a clear error when a workspace marker exists in an ancestor directory", async () => {
    await writeFile(
      path.join(dir, "pnpm-workspace.yaml"),
      "packages:\n  - apps/*",
    );
    const consumerRoot = path.join(dir, "apps", "checkout-web");
    await mkdir(consumerRoot, { recursive: true });
    await writeFile(path.join(consumerRoot, "pnpm-lock.yaml"), "");

    await expect(
      assertStandaloneProject(consumerRoot, "pnpm-lock.yaml", [
        "pnpm-workspace.yaml",
      ]),
    ).rejects.toThrow(/pnpm-workspace\.yaml/);
  });
});

describe("pruneStaleDependencyVolumes", () => {
  it("removes every matching volume except the current one", async () => {
    const removed: string[] = [];
    const exec = vi.fn(async (command: string) => {
      if (command.startsWith("docker volume ls")) {
        return ok(
          "schemend-deps-abc-old1\nschemend-deps-abc-current\nschemend-deps-abc-old2\n",
        );
      }
      if (command.startsWith("docker volume rm")) {
        removed.push(command);
        return ok("");
      }
      return ok("");
    });

    await pruneStaleDependencyVolumes(
      exec,
      "/some/root",
      "schemend-deps-abc-current",
    );

    expect(removed).toHaveLength(2);
    expect(removed.some((c) => c.includes("old1"))).toBe(true);
    expect(removed.some((c) => c.includes("old2"))).toBe(true);
    expect(removed.some((c) => c.includes("current"))).toBe(false);
  });

  it("does nothing (best-effort) if listing fails", async () => {
    const exec = vi.fn(async () => failed("docker down"));
    await expect(
      pruneStaleDependencyVolumes(exec, "/root", "current"),
    ).resolves.toBeUndefined();
    expect(exec).toHaveBeenCalledTimes(1);
  });
});
