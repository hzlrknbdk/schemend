import { describe, expect, it } from "vitest";
import {
  githubApiBase,
  MissingGithubRepositoryError,
  MissingGithubTokenError,
  readGithubRepository,
  readGithubToken,
} from "./github-env.js";

describe("readGithubToken", () => {
  it("returns GITHUB_TOKEN when set", () => {
    expect(readGithubToken({ GITHUB_TOKEN: "ghp_abc" })).toBe("ghp_abc");
  });

  it("throws MissingGithubTokenError when unset", () => {
    expect(() => readGithubToken({})).toThrow(MissingGithubTokenError);
  });
});

describe("readGithubRepository", () => {
  it("parses owner/repo", () => {
    expect(readGithubRepository({ GITHUB_REPOSITORY: "acme/widgets" })).toEqual(
      { owner: "acme", repo: "widgets" },
    );
  });

  it("throws MissingGithubRepositoryError when unset", () => {
    expect(() => readGithubRepository({})).toThrow(
      MissingGithubRepositoryError,
    );
  });

  it("throws MissingGithubRepositoryError on a malformed value", () => {
    expect(() =>
      readGithubRepository({ GITHUB_REPOSITORY: "not-a-slug" }),
    ).toThrow(MissingGithubRepositoryError);
  });
});

describe("githubApiBase", () => {
  it("defaults to api.github.com", () => {
    expect(githubApiBase({})).toBe("https://api.github.com");
  });

  it("uses GITHUB_API_URL for GitHub Enterprise Server", () => {
    expect(
      githubApiBase({ GITHUB_API_URL: "https://ghe.acme.internal/api/v3" }),
    ).toBe("https://ghe.acme.internal/api/v3");
  });
});
