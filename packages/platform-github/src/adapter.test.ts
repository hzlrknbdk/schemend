import type { Exec } from "@schemend/core";
import { GitLsRemoteError } from "@schemend/core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  GitPushError,
  getDefaultBranch,
  githubAdapter,
  MissingChangeRequestNumberError,
} from "./adapter.js";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status });
}

let originalEnv: NodeJS.ProcessEnv;

beforeEach(() => {
  originalEnv = { ...process.env };
  process.env.GITHUB_TOKEN = "ghp_test_token";
  process.env.GITHUB_REPOSITORY = "acme/widgets";
});

afterEach(() => {
  process.env = originalEnv;
  vi.unstubAllGlobals();
});

describe("detectCi", () => {
  it("is true only when GITHUB_ACTIONS is the literal string 'true'", () => {
    expect(githubAdapter.detectCi({ GITHUB_ACTIONS: "true" })).toBe(true);
    expect(githubAdapter.detectCi({})).toBe(false);
    expect(githubAdapter.detectCi({ GITHUB_ACTIONS: "false" })).toBe(false);
  });
});

describe("pushBranch", () => {
  it("discovers existing extraheader keys, then ls-remotes and force-with-lease pushes with an explicit sha, auth only in env", async () => {
    const calls: Array<{ command: string; env?: Record<string, string> }> = [];
    const exec: Exec = async (command, env) => {
      calls.push({ command, ...(env !== undefined ? { env } : {}) });
      if (command.includes("config --get-regexp")) {
        return { exitCode: 1, stdout: "", stderr: "" }; // nothing configured
      }
      if (command.includes("ls-remote")) {
        return {
          exitCode: 0,
          stdout: "abc123\trefs/heads/schemend/update\n",
          stderr: "",
        };
      }
      return { exitCode: 0, stdout: "", stderr: "" };
    };

    await githubAdapter.pushBranch("/repo/consumer", "schemend/update", exec);

    expect(calls).toHaveLength(3);
    expect(calls[0]?.command).toContain("config --get-regexp");
    expect(calls[1]?.command).toBe(
      "git -C /repo/consumer ls-remote origin refs/heads/schemend/update",
    );
    expect(calls[2]?.command).toBe(
      "git -C /repo/consumer push --force-with-lease=schemend/update:abc123 origin schemend/update",
    );
    for (const call of calls.slice(1)) {
      expect(call.command).not.toContain("ghp_test_token");
      expect(call.env?.GIT_CONFIG_VALUE_1).toContain("AUTHORIZATION: basic ");
      expect(call.env?.GIT_CONFIG_KEY_1).toBe("http.extraheader");
      expect(call.env?.GIT_CONFIG_VALUE_0).toBe("");
    }
  });

  it("uses an empty expected-sha when the branch doesn't exist on the remote yet (brand new branch)", async () => {
    const calls: string[] = [];
    const exec: Exec = async (command) => {
      calls.push(command);
      if (command.includes("config --get-regexp")) {
        return { exitCode: 1, stdout: "", stderr: "" };
      }
      if (command.includes("ls-remote")) {
        return { exitCode: 0, stdout: "", stderr: "" };
      }
      return { exitCode: 0, stdout: "", stderr: "" };
    };

    await githubAdapter.pushBranch("/repo/consumer", "schemend/update", exec);

    expect(calls[2]).toBe(
      "git -C /repo/consumer push --force-with-lease=schemend/update: origin schemend/update",
    );
  });

  it("simulates actions/checkout's persisted token: writes our header under the same discovered key, never the bare one", async () => {
    const calls: Array<{ command: string; env?: Record<string, string> }> = [];
    const exec: Exec = async (command, env) => {
      calls.push({ command, ...(env !== undefined ? { env } : {}) });
      if (command.includes("config --get-regexp")) {
        return {
          exitCode: 0,
          stdout:
            "http.https://github.com/.extraheader AUTHORIZATION: basic PERSISTED_BY_CHECKOUT\n",
          stderr: "",
        };
      }
      return { exitCode: 0, stdout: "", stderr: "" };
    };

    await githubAdapter.pushBranch("/repo/consumer", "schemend/update", exec);

    const push = calls[2];
    expect(push?.env?.GIT_CONFIG_KEY_0).toBe(
      "http.https://github.com/.extraheader",
    );
    expect(push?.env?.GIT_CONFIG_VALUE_0).toBe("");
    expect(push?.env?.GIT_CONFIG_KEY_1).toBe(
      "http.https://github.com/.extraheader",
    );
    expect(push?.env?.GIT_CONFIG_VALUE_1).toContain("AUTHORIZATION: basic ");
    expect(push?.env?.GIT_CONFIG_VALUE_1).not.toContain(
      "PERSISTED_BY_CHECKOUT",
    );
    expect(push?.env?.GIT_CONFIG_KEY_2).toBeUndefined();
  });

  it("never writes to .git/config - the discovery call is read-only", async () => {
    const commands: string[] = [];
    const exec: Exec = async (command) => {
      commands.push(command);
      if (command.includes("config --get-regexp")) {
        return { exitCode: 1, stdout: "", stderr: "" };
      }
      return { exitCode: 0, stdout: "", stderr: "" };
    };

    await githubAdapter.pushBranch("/repo/consumer", "schemend/update", exec);

    for (const command of commands) {
      expect(command).not.toMatch(/git .*config (?!--get-regexp)/);
    }
  });

  it("throws GitLsRemoteError when ls-remote fails - never silently treats a failure as a brand new branch", async () => {
    const exec: Exec = async (command) =>
      command.includes("ls-remote")
        ? { exitCode: 128, stdout: "", stderr: "could not resolve host" }
        : { exitCode: 0, stdout: "", stderr: "" };

    await expect(
      githubAdapter.pushBranch("/repo/consumer", "schemend/update", exec),
    ).rejects.toThrow(GitLsRemoteError);
  });

  it("throws GitPushError when the push itself fails", async () => {
    const exec: Exec = async (command) =>
      command.includes("push")
        ? { exitCode: 1, stdout: "", stderr: "stale info" }
        : { exitCode: 0, stdout: "", stderr: "" };

    await expect(
      githubAdapter.pushBranch("/repo/consumer", "schemend/update", exec),
    ).rejects.toThrow(GitPushError);
  });
});

describe("openChangeRequest", () => {
  it("creates a new PR when none is open for the branch, searching with head=owner:branch", async () => {
    const fetchMock = vi.fn(async (url: string | URL, init?: RequestInit) => {
      const href = String(url);
      if (href.includes("/pulls?")) return jsonResponse([]);
      if (init?.method === "POST") {
        return jsonResponse(
          { html_url: "https://github.com/acme/widgets/pull/42", number: 42 },
          201,
        );
      }
      throw new Error(`unexpected fetch: ${href}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await githubAdapter.openChangeRequest({
      branch: "schemend/update",
      baseBranch: "main",
      title: "t",
      body: "b",
    });

    expect(result).toEqual({
      url: "https://github.com/acme/widgets/pull/42",
      number: 42,
    });
    const listUrl = String(
      fetchMock.mock.calls.find(([url]) =>
        String(url).includes("/pulls?"),
      )?.[0],
    );
    expect(listUrl).toContain("head=acme:schemend%2Fupdate");
  });

  it("updates the existing open PR instead of creating a duplicate", async () => {
    const fetchMock = vi.fn(async (url: string | URL, init?: RequestInit) => {
      const href = String(url);
      if (href.includes("/pulls?")) {
        return jsonResponse([
          { html_url: "https://github.com/acme/widgets/pull/7", number: 7 },
        ]);
      }
      if (init?.method === "PATCH" && href.endsWith("/pulls/7")) {
        return jsonResponse({
          html_url: "https://github.com/acme/widgets/pull/7",
          number: 7,
        });
      }
      throw new Error(`unexpected fetch: ${href} ${init?.method}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await githubAdapter.openChangeRequest({
      branch: "schemend/update",
      baseBranch: "main",
      title: "t",
      body: "b",
    });

    expect(result).toEqual({
      url: "https://github.com/acme/widgets/pull/7",
      number: 7,
    });
    expect(
      fetchMock.mock.calls.some(
        ([url, init]) =>
          init?.method === "PATCH" && String(url).endsWith("/pulls/7"),
      ),
    ).toBe(true);
  });
});

describe("comment", () => {
  it("posts to the issues comments endpoint using the ChangeRequest's number, not the url", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({}, 201));
    vi.stubGlobal("fetch", fetchMock);

    await githubAdapter.comment(
      { url: "https://github.com/acme/widgets/pull/42", number: 42 },
      "hello",
    );

    const [url, init] = fetchMock.mock.calls[0] ?? [];
    expect(url).toBe(
      "https://api.github.com/repos/acme/widgets/issues/42/comments",
    );
    expect(JSON.parse(String(init?.body))).toEqual({ body: "hello" });
  });

  it("throws MissingChangeRequestNumberError when the ChangeRequest has no number", async () => {
    await expect(
      githubAdapter.comment({ url: "https://github.com/acme/widgets" }, "hi"),
    ).rejects.toThrow(MissingChangeRequestNumberError);
  });
});

describe("getDefaultBranch", () => {
  it("reads default_branch from the repo, not a hardcoded 'main'", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(jsonResponse({ default_branch: "trunk" })),
    );
    expect(await getDefaultBranch("acme", "widgets", "ghp_test_token")).toBe(
      "trunk",
    );
  });
});
