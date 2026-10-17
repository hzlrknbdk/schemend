import type { Exec } from "@schemend/core";
import { GitLsRemoteError } from "@schemend/core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  GitPushError,
  getDefaultBranch,
  gitlabAdapter,
  MissingChangeRequestNumberError,
} from "./adapter.js";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status });
}

let originalEnv: NodeJS.ProcessEnv;

beforeEach(() => {
  originalEnv = { ...process.env };
  process.env.GITLAB_TOKEN = "glpat-test-token";
  process.env.CI_PROJECT_ID = "123";
  process.env.CI_PROJECT_URL = "https://gitlab.com/acme/widgets";
});

afterEach(() => {
  process.env = originalEnv;
  vi.unstubAllGlobals();
});

describe("detectCi", () => {
  it("is true only when GITLAB_CI is the literal string 'true'", () => {
    expect(gitlabAdapter.detectCi({ GITLAB_CI: "true" })).toBe(true);
    expect(gitlabAdapter.detectCi({})).toBe(false);
    expect(gitlabAdapter.detectCi({ GITLAB_CI: "false" })).toBe(false);
  });
});

describe("pushBranch", () => {
  it("pushes straight to CI_PROJECT_URL (never a named remote) with an explicit force-with-lease sha, auth only in env", async () => {
    const calls: Array<{ command: string; env?: Record<string, string> }> = [];
    const exec: Exec = async (command, env) => {
      calls.push({ command, ...(env !== undefined ? { env } : {}) });
      if (command.includes("config --get-regexp")) {
        return { exitCode: 1, stdout: "", stderr: "" };
      }
      if (command.includes("ls-remote")) {
        return {
          exitCode: 0,
          stdout: "def456\trefs/heads/schemend/update\n",
          stderr: "",
        };
      }
      return { exitCode: 0, stdout: "", stderr: "" };
    };

    await gitlabAdapter.pushBranch("/repo/consumer", "schemend/update", exec);

    expect(calls).toHaveLength(3);
    expect(calls[0]?.command).toContain("config --get-regexp");
    expect(calls[1]?.command).toBe(
      "git -C /repo/consumer ls-remote https://gitlab.com/acme/widgets.git refs/heads/schemend/update",
    );
    expect(calls[2]?.command).toBe(
      "git -C /repo/consumer push --force-with-lease=schemend/update:def456 https://gitlab.com/acme/widgets.git schemend/update",
    );
    for (const call of calls) {
      expect(call.command).not.toContain("glpat-test-token");
    }
    expect(calls[2]?.env?.GIT_CONFIG_VALUE_1).toContain(
      "AUTHORIZATION: basic ",
    );
    expect(calls[2]?.env?.GIT_CONFIG_KEY_1).toBe("http.extraheader");
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

    await gitlabAdapter.pushBranch("/repo/consumer", "schemend/update", exec);

    expect(calls[2]).toBe(
      "git -C /repo/consumer push --force-with-lease=schemend/update: https://gitlab.com/acme/widgets.git schemend/update",
    );
  });

  it("simulates a GitLab CI runner that persisted its own extraheader: our header goes under the same key, never the bare one", async () => {
    const calls: Array<{ command: string; env?: Record<string, string> }> = [];
    const exec: Exec = async (command, env) => {
      calls.push({ command, ...(env !== undefined ? { env } : {}) });
      if (command.includes("config --get-regexp")) {
        return {
          exitCode: 0,
          stdout:
            "http.https://gitlab.com/.extraheader AUTHORIZATION: basic PERSISTED_BY_RUNNER\n",
          stderr: "",
        };
      }
      return { exitCode: 0, stdout: "", stderr: "" };
    };

    await gitlabAdapter.pushBranch("/repo/consumer", "schemend/update", exec);

    const push = calls[2];
    expect(push?.env?.GIT_CONFIG_KEY_0).toBe(
      "http.https://gitlab.com/.extraheader",
    );
    expect(push?.env?.GIT_CONFIG_VALUE_0).toBe("");
    expect(push?.env?.GIT_CONFIG_KEY_1).toBe(
      "http.https://gitlab.com/.extraheader",
    );
    expect(push?.env?.GIT_CONFIG_VALUE_1).toContain("AUTHORIZATION: basic ");
    expect(push?.env?.GIT_CONFIG_VALUE_1).not.toContain("PERSISTED_BY_RUNNER");
  });

  it("never writes to .git/config - the discovery call is read-only, and no 'remote add'/'remote set-url' is ever run", async () => {
    const commands: string[] = [];
    const exec: Exec = async (command) => {
      commands.push(command);
      if (command.includes("config --get-regexp")) {
        return { exitCode: 1, stdout: "", stderr: "" };
      }
      return { exitCode: 0, stdout: "", stderr: "" };
    };

    await gitlabAdapter.pushBranch("/repo/consumer", "schemend/update", exec);

    for (const command of commands) {
      expect(command).not.toMatch(/git .*config (?!--get-regexp)/);
      expect(command).not.toContain("remote add");
      expect(command).not.toContain("remote set-url");
    }
  });

  it("throws GitLsRemoteError when ls-remote fails - never silently treats a failure as a brand new branch", async () => {
    const exec: Exec = async (command) =>
      command.includes("ls-remote")
        ? { exitCode: 128, stdout: "", stderr: "could not resolve host" }
        : { exitCode: 0, stdout: "", stderr: "" };

    await expect(
      gitlabAdapter.pushBranch("/repo/consumer", "schemend/update", exec),
    ).rejects.toThrow(GitLsRemoteError);
  });

  it("throws GitPushError when the push itself fails", async () => {
    const exec: Exec = async (command) =>
      command.includes("push")
        ? { exitCode: 1, stdout: "", stderr: "stale info" }
        : { exitCode: 0, stdout: "", stderr: "" };

    await expect(
      gitlabAdapter.pushBranch("/repo/consumer", "schemend/update", exec),
    ).rejects.toThrow(GitPushError);
  });
});

describe("openChangeRequest", () => {
  it("creates a new MR when none is open, searching by source_branch/target_branch/state=opened", async () => {
    const fetchMock = vi.fn(async (url: string | URL, init?: RequestInit) => {
      const href = String(url);
      if (href.includes("/merge_requests?")) return jsonResponse([]);
      if (init?.method === "POST") {
        return jsonResponse(
          {
            web_url: "https://gitlab.com/acme/widgets/-/merge_requests/42",
            iid: 42,
          },
          201,
        );
      }
      throw new Error(`unexpected fetch: ${href}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await gitlabAdapter.openChangeRequest({
      branch: "schemend/update",
      baseBranch: "main",
      title: "t",
      body: "b",
    });

    expect(result).toEqual({
      url: "https://gitlab.com/acme/widgets/-/merge_requests/42",
      number: 42,
    });
    const listUrl = String(
      fetchMock.mock.calls.find(([url]) =>
        String(url).includes("/merge_requests?"),
      )?.[0],
    );
    expect(listUrl).toContain("source_branch=schemend%2Fupdate");
    expect(listUrl).toContain("target_branch=main");
    expect(listUrl).toContain("state=opened");

    const created = fetchMock.mock.calls.find(
      ([, init]) => init?.method === "POST",
    )?.[1];
    expect(JSON.parse(String(created?.body))).toEqual({
      source_branch: "schemend/update",
      target_branch: "main",
      title: "t",
      description: "b",
    });
  });

  it("updates the existing open MR instead of creating a duplicate", async () => {
    const fetchMock = vi.fn(async (url: string | URL, init?: RequestInit) => {
      const href = String(url);
      if (href.includes("/merge_requests?")) {
        return jsonResponse([
          {
            web_url: "https://gitlab.com/acme/widgets/-/merge_requests/7",
            iid: 7,
          },
        ]);
      }
      if (init?.method === "PUT" && href.endsWith("/merge_requests/7")) {
        return jsonResponse({
          web_url: "https://gitlab.com/acme/widgets/-/merge_requests/7",
          iid: 7,
        });
      }
      throw new Error(`unexpected fetch: ${href} ${init?.method}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await gitlabAdapter.openChangeRequest({
      branch: "schemend/update",
      baseBranch: "main",
      title: "t",
      body: "b",
    });

    expect(result).toEqual({
      url: "https://gitlab.com/acme/widgets/-/merge_requests/7",
      number: 7,
    });
    expect(
      fetchMock.mock.calls.some(
        ([url, init]) =>
          init?.method === "PUT" && String(url).endsWith("/merge_requests/7"),
      ),
    ).toBe(true);
  });

  it("URL-encodes a 'namespace/project' CI_PROJECT_ID", async () => {
    process.env.CI_PROJECT_ID = "acme/widgets";
    const fetchMock = vi.fn(async (_url: string | URL) => jsonResponse([]));
    vi.stubGlobal("fetch", fetchMock);

    await gitlabAdapter
      .openChangeRequest({
        branch: "schemend/update",
        baseBranch: "main",
        title: "t",
        body: "b",
      })
      .catch(() => {});

    expect(String(fetchMock.mock.calls[0]?.[0])).toContain(
      "/projects/acme%2Fwidgets/merge_requests",
    );
  });
});

describe("comment", () => {
  it("posts to the merge request notes endpoint using the ChangeRequest's number as iid, not a parsed url", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({}, 201));
    vi.stubGlobal("fetch", fetchMock);

    await gitlabAdapter.comment(
      {
        url: "https://gitlab.com/acme/widgets/-/merge_requests/42",
        number: 42,
      },
      "hello",
    );

    const [url, init] = fetchMock.mock.calls[0] ?? [];
    expect(url).toBe(
      "https://gitlab.com/api/v4/projects/123/merge_requests/42/notes",
    );
    expect(JSON.parse(String(init?.body))).toEqual({ body: "hello" });
  });

  it("throws MissingChangeRequestNumberError when the ChangeRequest has no number", async () => {
    await expect(
      gitlabAdapter.comment({ url: "https://gitlab.com/acme/widgets" }, "hi"),
    ).rejects.toThrow(MissingChangeRequestNumberError);
  });
});

describe("getDefaultBranch", () => {
  it("reads default_branch from the project, not a hardcoded 'main'", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(jsonResponse({ default_branch: "trunk" })),
    );
    expect(await getDefaultBranch("123", "glpat-test-token")).toBe("trunk");
  });
});
