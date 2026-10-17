import { afterEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { GitlabApiError, gitlabRequest } from "./gitlab-request.js";

const Schema = z.object({ ok: z.boolean() });

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("gitlabRequest", () => {
  it("sends PRIVATE-TOKEN, and parses the response through the schema", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify({ ok: true }), { status: 200 }),
      );
    vi.stubGlobal("fetch", fetchMock);

    const result = await gitlabRequest(
      "glpat-secret",
      "GET",
      "/projects/123",
      Schema,
    );

    expect(result).toEqual({ ok: true });
    const [url, init] = fetchMock.mock.calls[0] ?? [];
    expect(url).toBe("https://gitlab.com/api/v4/projects/123");
    expect(init.headers["PRIVATE-TOKEN"]).toBe("glpat-secret");
  });

  it("uses CI_API_V4_URL when set", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify({ ok: true }), { status: 200 }),
      );
    vi.stubGlobal("fetch", fetchMock);

    await gitlabRequest(
      "glpat-secret",
      "GET",
      "/projects/123",
      Schema,
      undefined,
      { CI_API_V4_URL: "https://gitlab.acme.internal/api/v4" },
    );

    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      "https://gitlab.acme.internal/api/v4/projects/123",
    );
  });

  it("throws GitlabApiError on a non-2xx response, without the token in the message", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockImplementation(
          async () => new Response("not found", { status: 404 }),
        ),
    );

    await expect(
      gitlabRequest("glpat-secret", "GET", "/projects/123", Schema),
    ).rejects.toThrow(GitlabApiError);

    try {
      await gitlabRequest("glpat-secret", "GET", "/projects/123", Schema);
      expect.unreachable();
    } catch (error) {
      const message = (error as Error).message;
      expect(message).not.toContain("glpat-secret");
      expect(message).toContain("token doesn't have access");
    }
  });
});
