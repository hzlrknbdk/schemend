import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import type { ApiChange, ApiEntry } from "@schemend/core";
import { parseOasdiffChangelog } from "@schemend/core";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { findAffected } from "./impact.js";

const FIXTURES_DIR = path.join(import.meta.dirname, "fixtures");

let root: string;

async function write(relPath: string, content: string): Promise<void> {
	const full = path.join(root, relPath);
	await mkdir(path.dirname(full), { recursive: true });
	await writeFile(full, content);
}

const api: ApiEntry = {
	name: "orders",
	kind: "internal",
	source: { type: "openapi", location: "../../services/orders/openapi.json" },
	usedIn: ["src/lib"],
};

const totalPriceRemoved: ApiChange = {
	id: "response-property-removed:GET:/orders#0",
	severity: "breaking",
	summary:
		"removed the required property `items/totalPrice` from the response with the `200` status",
	target: "GET /orders",
	source: { tool: "oasdiff", id: "response-property-removed", level: 2 },
};

const warehouseIdRequired: ApiChange = {
	id: "request-parameter-added:POST:/orders#1",
	severity: "breaking",
	summary: "added the required parameter `warehouseId` to the request",
	target: "POST /orders",
	source: { tool: "oasdiff", id: "request-parameter-added", level: 3 },
};

async function writeTsconfig(): Promise<void> {
	await write(
		"tsconfig.json",
		JSON.stringify({
			compilerOptions: {
				target: "ES2023",
				module: "NodeNext",
				moduleResolution: "NodeNext",
				strict: true,
				skipLibCheck: true,
			},
			include: ["src"],
		}),
	);
}

// Simulates the "already regenerated" state: the generated client reflects the new schema
// (total.amount/currency), but the consumer code hasn't been updated yet.
async function writeRegeneratedFixture(): Promise<void> {
	await writeTsconfig();
	await write(
		"src/lib/orders-api.ts",
		[
			"export interface Order {",
			"  total: { amount: number; currency: string };",
			"}",
			"",
		].join("\n"),
	);
	await write(
		"src/lib/orders-client.ts",
		[
			'import type { Order } from "./orders-api.js";',
			"",
			"export function formatPrice(order: Order): string {",
			// biome-ignore lint/suspicious/noTemplateCurlyInString: fixture source text, not a real template literal
			"  return `${order.totalPrice} TRY`;",
			"}",
			"",
		].join("\n"),
	);
}

const dummyCtx = () => ({
	root,
	exec: async () => ({ exitCode: 0, stdout: "", stderr: "" }),
});

beforeEach(async () => {
	root = await mkdtemp(path.join(tmpdir(), "schemend-lang-ts-impact-"));
});

afterEach(async () => {
	await rm(root, { recursive: true, force: true });
});

describe("findAffected", () => {
	it("finds the line still using a removed field and attributes it to the matching change", async () => {
		await writeRegeneratedFixture();

		const locations = await findAffected(dummyCtx(), api, [totalPriceRemoved]);

		expect(locations).toHaveLength(1);
		expect(locations[0]).toMatchObject({
			file: "src/lib/orders-client.ts",
			line: 4,
			changeId: totalPriceRemoved.id,
		});
		expect(locations[0]?.snippet).toContain("totalPrice");
	});

	it("attributes diagnostics to the right change when there are several", async () => {
		await writeTsconfig();
		await write(
			"src/lib/orders-api.ts",
			[
				"export interface Order {",
				"  total: { amount: number; currency: string };",
				"}",
				"export interface CreateOrderRequest {",
				"  warehouseId: string;",
				"}",
				"",
			].join("\n"),
		);
		await write(
			"src/lib/orders-client.ts",
			[
				'import type { CreateOrderRequest, Order } from "./orders-api.js";',
				"",
				"export function formatPrice(order: Order): string {",
				// biome-ignore lint/suspicious/noTemplateCurlyInString: fixture source text, not a real template literal
				"  return `${order.totalPrice} TRY`;",
				"}",
				"",
				"export function buildRequest(): CreateOrderRequest {",
				"  return {};",
				"}",
				"",
			].join("\n"),
		);

		const locations = await findAffected(dummyCtx(), api, [
			totalPriceRemoved,
			warehouseIdRequired,
		]);

		expect(locations).toHaveLength(2);
		expect(locations.map((l) => l.changeId).sort()).toEqual(
			[totalPriceRemoved.id, warehouseIdRequired.id].sort(),
		);
	});

	it("drops diagnostics that don't match any change instead of guessing", async () => {
		await writeTsconfig();
		await write(
			"src/lib/orders-api.ts",
			["export interface Order {", "  id: string;", "}", ""].join("\n"),
		);
		// A type error unrelated to any schema change (wrong argument type).
		await write(
			"src/lib/orders-client.ts",
			[
				'import type { Order } from "./orders-api.js";',
				"",
				"function needsNumber(n: number): number {",
				"  return n;",
				"}",
				"",
				'needsNumber("not a number");',
				"",
				"export type { Order };",
				"",
			].join("\n"),
		);

		const locations = await findAffected(dummyCtx(), api, [totalPriceRemoved]);

		expect(locations).toEqual([]);
	});

	it("also finds files outside api.usedIn that reach the type indirectly", async () => {
		await writeTsconfig();
		await write(
			"src/lib/orders-api.ts",
			[
				"export interface Order {",
				"  total: { amount: number; currency: string };",
				"}",
				"",
			].join("\n"),
		);
		// Inside api.usedIn (["src/lib"]): imports the generated client directly.
		await write(
			"src/lib/orders-client.ts",
			[
				'export type { Order } from "./orders-api.js";',
				'import type { Order } from "./orders-api.js";',
				"",
				"export function formatPrice(order: Order): string {",
				// biome-ignore lint/suspicious/noTemplateCurlyInString: fixture source text, not a real template literal
				"  return `${order.totalPrice} TRY`;",
				"}",
				"",
			].join("\n"),
		);
		// Outside api.usedIn: only reaches Order indirectly through orders-client.ts.
		await write(
			"src/components/OrderSummary.tsx",
			[
				'import type { Order } from "../lib/orders-client.js";',
				"",
				"export function OrderSummary(order: Order): string {",
				// biome-ignore lint/suspicious/noTemplateCurlyInString: fixture source text, not a real template literal
				"  return `${order.totalPrice}`;",
				"}",
				"",
			].join("\n"),
		);

		const locations = await findAffected(dummyCtx(), api, [totalPriceRemoved]);

		const files = locations.map((l) => l.file).sort();
		expect(files).toEqual(
			["src/components/OrderSummary.tsx", "src/lib/orders-client.ts"].sort(),
		);
	});

	// Regression test for a real bug: oasdiff quotes field names with backticks
	// (` `totalPrice` `), never the single quotes every other test fixture above hand-writes. The
	// old matching code only ever matched single quotes, so it silently found zero affected
	// locations against every real oasdiff response. This fixture is the actual, unedited output
	// of `oasdiff changelog -f json` for services/orders' totalPrice -> total{amount,currency}
	// change (SPEC §8's main demo change), captured by running the real CLI end to end.
	it("finds the real affected locations from a real, saved oasdiff response", async () => {
		const rawChangelog = await readFile(
			path.join(FIXTURES_DIR, "oasdiff-field-to-object.json"),
			"utf-8",
		);
		const changes = parseOasdiffChangelog(rawChangelog);

		await writeTsconfig();
		await write(
			"src/lib/orders-api.ts",
			[
				"export interface Order {",
				"  total: { amount: number; currency: string };",
				"}",
				"",
			].join("\n"),
		);
		await write(
			"src/lib/shipping.ts",
			[
				'import type { Order } from "./orders-api.js";',
				"",
				"const FREE_SHIPPING_THRESHOLD = 50;",
				"",
				"export function qualifiesForFreeShipping(order: Order): boolean {",
				"  return order.totalPrice >= FREE_SHIPPING_THRESHOLD;",
				"}",
				"",
			].join("\n"),
		);

		const locations = await findAffected(dummyCtx(), api, changes);

		expect(locations).toHaveLength(1);
		expect(locations[0]).toMatchObject({ file: "src/lib/shipping.ts" });
	});
});
