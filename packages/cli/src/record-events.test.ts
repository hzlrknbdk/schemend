import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import type { CheckEvent } from "@schemend/core";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createEventRecorder } from "./record-events.js";

let dir: string;

beforeEach(async () => {
	dir = await mkdtemp(path.join(tmpdir(), "schemend-record-events-"));
});

afterEach(async () => {
	await rm(dir, { recursive: true, force: true });
});

describe("createEventRecorder", () => {
	it("writes one JSON line per event, in order, and closes cleanly", async () => {
		const file = path.join(dir, "events.ndjson");
		const recorder = createEventRecorder(file);

		const events: CheckEvent[] = [
			{
				type: "run-started",
				timestamp: "2026-01-01T00:00:00.000Z",
				eventSchemaVersion: 1,
				apis: ["orders"],
				budgetUsd: 1,
			},
			{
				type: "step-started",
				timestamp: "2026-01-01T00:00:01.000Z",
				api: "orders",
				step: "detect",
			},
		];
		for (const event of events) recorder.onEvent(event);
		await recorder.close();

		const lines = (await readFile(file, "utf-8")).trim().split("\n");
		expect(lines.map((line) => JSON.parse(line))).toEqual(events);
	});
});
