import type { CheckEvent } from "@schemend/core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createJsonRenderer } from "./json.js";

const event: CheckEvent = {
  type: "step-started",
  timestamp: "2026-01-01T00:00:00.000Z",
  api: "orders",
  step: "baseline",
};

beforeEach(() => {
  vi.spyOn(console, "log").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("createJsonRenderer", () => {
  it("prints each event as one JSON line, unmodified", () => {
    const renderer = createJsonRenderer();
    renderer.onEvent(event);

    expect(console.log).toHaveBeenCalledTimes(1);
    const line = vi.mocked(console.log).mock.calls[0]?.[0] as string;
    expect(JSON.parse(line)).toEqual(event);
  });
});
