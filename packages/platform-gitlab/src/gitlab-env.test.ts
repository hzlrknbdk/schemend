import { describe, expect, it } from "vitest";
import {
  gitlabApiBase,
  MissingGitlabProjectError,
  MissingGitlabProjectUrlError,
  MissingGitlabTokenError,
  readGitlabProjectId,
  readGitlabProjectUrl,
  readGitlabToken,
} from "./gitlab-env.js";

describe("readGitlabToken", () => {
  it("returns GITLAB_TOKEN when set", () => {
    expect(readGitlabToken({ GITLAB_TOKEN: "glpat-abc" })).toBe("glpat-abc");
  });

  it("throws MissingGitlabTokenError when unset", () => {
    expect(() => readGitlabToken({})).toThrow(MissingGitlabTokenError);
  });
});

describe("readGitlabProjectId", () => {
  it("returns a numeric CI_PROJECT_ID as-is", () => {
    expect(readGitlabProjectId({ CI_PROJECT_ID: "123" })).toBe("123");
  });

  it("also accepts a 'namespace/project' path", () => {
    expect(readGitlabProjectId({ CI_PROJECT_ID: "acme/widgets" })).toBe(
      "acme/widgets",
    );
  });

  it("throws MissingGitlabProjectError when unset", () => {
    expect(() => readGitlabProjectId({})).toThrow(MissingGitlabProjectError);
  });
});

describe("readGitlabProjectUrl", () => {
  it("returns CI_PROJECT_URL when set", () => {
    expect(
      readGitlabProjectUrl({
        CI_PROJECT_URL: "https://gitlab.com/acme/widgets",
      }),
    ).toBe("https://gitlab.com/acme/widgets");
  });

  it("throws MissingGitlabProjectUrlError when unset", () => {
    expect(() => readGitlabProjectUrl({})).toThrow(
      MissingGitlabProjectUrlError,
    );
  });
});

describe("gitlabApiBase", () => {
  it("defaults to gitlab.com/api/v4", () => {
    expect(gitlabApiBase({})).toBe("https://gitlab.com/api/v4");
  });

  it("uses CI_API_V4_URL for a self-hosted instance", () => {
    expect(
      gitlabApiBase({ CI_API_V4_URL: "https://gitlab.acme.internal/api/v4" }),
    ).toBe("https://gitlab.acme.internal/api/v4");
  });
});
