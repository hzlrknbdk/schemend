import { afterEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { GithubApiError, githubRequest } from "./github-request.js";

const Schema = z.object({ ok: z.boolean() });

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("githubRequest", () => {
  it("sends Authorization, Accept and API version headers, and parses the response through the schema", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify({ ok: true }), { status: 200 }),
      );
    vi.stubGlobal("fetch", fetchMock);

    const result = await githubRequest(
      "ghp_secret",
      "GET",
      "/repos/acme/widgets",
      Schema,
    );

    expect(result).toEqual({ ok: true });
    const [url, init] = fetchMock.mock.calls[0] ?? [];
    expect(url).toBe("https://api.github.com/repos/acme/widgets");
    expect(init.headers.Authorization).toBe("Bearer ghp_secret");
    expect(init.headers["X-GitHub-Api-Version"]).toBe("2022-11-28");
  });

  it("uses GITHUB_API_URL when set", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify({ ok: true }), { status: 200 }),
      );
    vi.stubGlobal("fetch", fetchMock);

    await githubRequest(
      "ghp_secret",
      "GET",
      "/repos/acme/widgets",
      Schema,
      undefined,
      { GITHUB_API_URL: "https://ghe.acme.internal/api/v3" },
    );

    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      "https://ghe.acme.internal/api/v3/repos/acme/widgets",
    );
  });

  it("throws GithubApiError on a non-2xx response, without the token in the message", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockImplementation(
          async () => new Response("not found", { status: 404 }),
        ),
    );

    await expect(
      githubRequest("ghp_secret", "GET", "/repos/acme/widgets", Schema),
    ).rejects.toThrow(GithubApiError);

    try {
      await githubRequest("ghp_secret", "GET", "/repos/acme/widgets", Schema);
      expect.unreachable();
    } catch (error) {
      const message = (error as Error).message;
      expect(message).not.toContain("ghp_secret");
      expect(message).toContain("token doesn't have access");
    }
  });
});
