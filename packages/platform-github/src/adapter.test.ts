import type { Exec } from "@schemend/core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  GitPushError,
  getDefaultBranch,
  githubAdapter,
  InvalidPrUrlError,
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
  it("fetches then force-with-lease pushes, with the auth header only in env, never in the command", async () => {
    const calls: Array<{ command: string; env?: Record<string, string> }> = [];
    const exec: Exec = async (command, env) => {
      calls.push({ command, ...(env !== undefined ? { env } : {}) });
      return { exitCode: 0, stdout: "", stderr: "" };
    };

    await githubAdapter.pushBranch("/repo/consumer", "schemend/update", exec);

    expect(calls).toHaveLength(2);
    expect(calls[0]?.command).toBe(
      "git -C /repo/consumer fetch origin schemend/update",
    );
    expect(calls[1]?.command).toBe(
      "git -C /repo/consumer push --force-with-lease origin schemend/update",
    );
    for (const call of calls) {
      expect(call.command).not.toContain("ghp_test_token");
      expect(call.env?.GIT_CONFIG_VALUE_0).toContain("AUTHORIZATION: basic ");
      expect(call.env?.GIT_CONFIG_KEY_0).toBe("http.extraheader");
    }
  });

  it("ignores a failing fetch (first push for a brand new branch) and still pushes", async () => {
    const exec: Exec = async (command) =>
      command.includes("fetch")
        ? { exitCode: 1, stdout: "", stderr: "couldn't find remote ref" }
        : { exitCode: 0, stdout: "", stderr: "" };

    await expect(
      githubAdapter.pushBranch("/repo/consumer", "schemend/update", exec),
    ).resolves.toBeUndefined();
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
  it("posts to the issues comments endpoint parsed from the PR url", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({}, 201));
    vi.stubGlobal("fetch", fetchMock);

    await githubAdapter.comment(
      "https://github.com/acme/widgets/pull/42",
      "hello",
    );

    const [url, init] = fetchMock.mock.calls[0] ?? [];
    expect(url).toBe(
      "https://api.github.com/repos/acme/widgets/issues/42/comments",
    );
    expect(JSON.parse(String(init?.body))).toEqual({ body: "hello" });
  });

  it("throws InvalidPrUrlError on a non-PR url", async () => {
    await expect(
      githubAdapter.comment("https://example.com/not-a-pr", "hi"),
    ).rejects.toThrow(InvalidPrUrlError);
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
