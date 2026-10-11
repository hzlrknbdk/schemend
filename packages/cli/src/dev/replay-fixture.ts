#!/usr/bin/env node
/**
 * Dev script (not part of the shipped `schemend` binary, SPEC §13): replays a CheckEvent[]
 * fixture through one of the three renderers at a realistic pace, so the interactive UI can be
 * developed without a real Claude API call. Takes either a built-in fixture name (see
 * ./fixtures/index.ts) or a path to an NDJSON file (e.g. one captured earlier with
 * `schemend check --record-events`).
 *
 * Usage: pnpm --filter @schemend/cli dev:replay <fixture-name-or-file> [interactive|plain|json]
 */
import { readFile } from "node:fs/promises";
import path from "node:path";
import type { CheckEvent } from "@schemend/core";
import { createRenderer, type RendererKind } from "../renderers/index.js";
import { FIXTURES } from "./fixtures/index.js";

const DELAY_MS = 150;

function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

async function loadEvents(nameOrPath: string): Promise<CheckEvent[]> {
	const builtIn = FIXTURES[nameOrPath];
	if (builtIn) return builtIn;

	const content = await readFile(path.resolve(nameOrPath), "utf-8");
	return content
		.split("\n")
		.map((line) => line.trim())
		.filter(Boolean)
		.map((line) => JSON.parse(line) as CheckEvent);
}

async function main(): Promise<void> {
	const [nameOrPath, kindArg] = process.argv.slice(2);
	if (!nameOrPath) {
		console.error(
			`Usage: dev:replay <fixture-name-or-file> [interactive|plain|json]\nBuilt-in fixtures: ${Object.keys(FIXTURES).join(", ")}`,
		);
		process.exitCode = 1;
		return;
	}

	const events = await loadEvents(nameOrPath);
	const kind: RendererKind =
		kindArg === "plain" || kindArg === "json" ? kindArg : "interactive";

	const renderer = createRenderer(kind, {
		productName: "schemend",
		version: "0.0.0-dev",
		consumer: "checkout-web",
		onCancel: () => {
			console.error("\n(cancel requested - this replay doesn't stop early)");
		},
	});

	for (const event of events) {
		renderer.onEvent(event);
		await sleep(DELAY_MS);
	}

	await renderer.stop?.();
}

await main();
