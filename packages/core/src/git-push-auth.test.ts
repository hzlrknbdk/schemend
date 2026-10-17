import { describe, expect, it } from "vitest";
import type { Exec } from "./context.js";
import {
  buildPushAuthEnv,
  discoverExtraHeaderKeys,
  GitLsRemoteError,
  getRemoteBranchSha,
} from "./git-push-auth.js";

describe("discoverExtraHeaderKeys", () => {
  it("parses one key per line, ignoring the value", async () => {
    const exec: Exec = async () => ({
      exitCode: 0,
      stdout:
        "http.https://github.com/.extraheader AUTHORIZATION: basic xyz\nhttp.https://example.com/.extraheader AUTHORIZATION: basic abc\n",
      stderr: "",
    });
    expect(await discoverExtraHeaderKeys("/repo", exec)).toEqual([
      "http.https://github.com/.extraheader",
      "http.https://example.com/.extraheader",
    ]);
  });

  it("returns an empty list when git config finds nothing (non-zero exit)", async () => {
    const exec: Exec = async () => ({ exitCode: 1, stdout: "", stderr: "" });
    expect(await discoverExtraHeaderKeys("/repo", exec)).toEqual([]);
  });
});

describe("buildPushAuthEnv", () => {
  it("falls back to the bare key when nothing was discovered", () => {
    const env = buildPushAuthEnv("x-access-token", "secret", []);
    expect(env.GIT_CONFIG_COUNT).toBe("2");
    expect(env.GIT_CONFIG_KEY_0).toBe("http.extraheader");
    expect(env.GIT_CONFIG_VALUE_0).toBe("");
    expect(env.GIT_CONFIG_KEY_1).toBe("http.extraheader");
    expect(env.GIT_CONFIG_VALUE_1).toContain("AUTHORIZATION: basic ");
  });

  it("resets then re-sets each discovered key, never the bare key", () => {
    const env = buildPushAuthEnv("x-access-token", "secret", [
      "http.https://github.com/.extraheader",
    ]);
    expect(env.GIT_CONFIG_COUNT).toBe("2");
    expect(env.GIT_CONFIG_KEY_0).toBe("http.https://github.com/.extraheader");
    expect(env.GIT_CONFIG_VALUE_0).toBe("");
    expect(env.GIT_CONFIG_KEY_1).toBe("http.https://github.com/.extraheader");
    expect(env.GIT_CONFIG_VALUE_1).toContain("AUTHORIZATION: basic ");
  });

  it("handles multiple discovered keys, resetting and re-setting each", () => {
    const env = buildPushAuthEnv("oauth2", "secret", [
      "http.https://gitlab.com/.extraheader",
      "http.https://example.com/.extraheader",
    ]);
    expect(env.GIT_CONFIG_COUNT).toBe("4");
    expect(env.GIT_CONFIG_KEY_0).toBe("http.https://gitlab.com/.extraheader");
    expect(env.GIT_CONFIG_VALUE_0).toBe("");
    expect(env.GIT_CONFIG_KEY_1).toBe("http.https://gitlab.com/.extraheader");
    expect(env.GIT_CONFIG_VALUE_1).toContain("AUTHORIZATION: basic ");
    expect(env.GIT_CONFIG_KEY_2).toBe("http.https://example.com/.extraheader");
    expect(env.GIT_CONFIG_VALUE_2).toBe("");
    expect(env.GIT_CONFIG_KEY_3).toBe("http.https://example.com/.extraheader");
    expect(env.GIT_CONFIG_VALUE_3).toContain("AUTHORIZATION: basic ");
  });

  it("never embeds the raw token in the command string - only in GIT_CONFIG_VALUE_* env", () => {
    const env = buildPushAuthEnv("x-access-token", "super-secret-token", []);
    const encoded = Buffer.from("x-access-token:super-secret-token").toString(
      "base64",
    );
    expect(env.GIT_CONFIG_VALUE_1).toBe(`AUTHORIZATION: basic ${encoded}`);
  });
});

describe("getRemoteBranchSha", () => {
  it("parses the sha out of ls-remote's first column, scoped to root with -C", async () => {
    let seenCommand: string | undefined;
    const exec: Exec = async (command) => {
      seenCommand = command;
      return {
        exitCode: 0,
        stdout: "abc123def456\trefs/heads/schemend/update\n",
        stderr: "",
      };
    };
    expect(
      await getRemoteBranchSha(
        "/repo/consumer",
        "origin",
        "schemend/update",
        exec,
        {},
      ),
    ).toBe("abc123def456");
    expect(seenCommand).toBe(
      "git -C /repo/consumer ls-remote origin refs/heads/schemend/update",
    );
  });

  it("returns undefined when the branch doesn't exist on the remote yet (exit 0, empty output)", async () => {
    const exec: Exec = async () => ({ exitCode: 0, stdout: "", stderr: "" });
    expect(
      await getRemoteBranchSha(
        "/repo/consumer",
        "origin",
        "schemend/update",
        exec,
        {},
      ),
    ).toBeUndefined();
  });

  it("throws GitLsRemoteError on a non-zero exit, never treats a failure as 'branch doesn't exist'", async () => {
    const exec: Exec = async () => ({
      exitCode: 128,
      stdout: "",
      stderr: "fatal: could not read from remote repository",
    });
    await expect(
      getRemoteBranchSha(
        "/repo/consumer",
        "origin",
        "schemend/update",
        exec,
        {},
      ),
    ).rejects.toThrow(GitLsRemoteError);
  });

  it("a scoping mistake (no -C, wrong repo) can't masquerade as 'branch doesn't exist': this is exactly why -C root is mandatory", async () => {
    // Regression guard for a real bug: without -C, `git ls-remote origin ...` resolves "origin"
    // against the *calling process's* cwd, not the repo being pushed - if that happens to be a
    // DIFFERENT git repo that also has a remote named "origin", the command exits 0 with no
    // matching ref, indistinguishable from a legitimately new branch. Asserting the exact -C
    // root command (covered above) is what actually prevents this, not exit-code handling alone.
    let seenCommand: string | undefined;
    const exec: Exec = async (command) => {
      seenCommand = command;
      return { exitCode: 0, stdout: "", stderr: "" };
    };
    await getRemoteBranchSha(
      "/repo/consumer",
      "origin",
      "schemend/update",
      exec,
      {},
    );
    expect(seenCommand).toContain("-C /repo/consumer");
  });

  it("passes the given env through to exec (so auth headers reach ls-remote too)", async () => {
    let seenEnv: Record<string, string> | undefined;
    const exec: Exec = async (_command, env) => {
      seenEnv = env;
      return { exitCode: 0, stdout: "", stderr: "" };
    };
    await getRemoteBranchSha(
      "/repo/consumer",
      "origin",
      "schemend/update",
      exec,
      { GIT_CONFIG_COUNT: "2" },
    );
    expect(seenEnv).toEqual({ GIT_CONFIG_COUNT: "2" });
  });
});
