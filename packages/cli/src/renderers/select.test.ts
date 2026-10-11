import { describe, expect, it } from "vitest";
import { selectRenderer } from "./select.js";

describe("selectRenderer", () => {
	it("picks json whenever --json is passed, regardless of TTY/CI", () => {
		expect(selectRenderer({ json: true, isTTY: true, isCi: false })).toBe(
			"json",
		);
		expect(selectRenderer({ json: true, isTTY: false, isCi: true })).toBe(
			"json",
		);
	});

	it("picks plain when there's no TTY", () => {
		expect(selectRenderer({ json: false, isTTY: false, isCi: false })).toBe(
			"plain",
		);
	});

	it("picks plain in CI even with a TTY", () => {
		expect(selectRenderer({ json: false, isTTY: true, isCi: true })).toBe(
			"plain",
		);
	});

	it("picks interactive for a real, non-CI terminal", () => {
		expect(selectRenderer({ json: false, isTTY: true, isCi: false })).toBe(
			"interactive",
		);
	});
});
