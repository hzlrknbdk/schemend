import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { detect, discoverApis, regenerateClient } from "./discover.js";

let root: string;

async function write(relPath: string, content: string): Promise<void> {
	const full = path.join(root, relPath);
	await mkdir(path.dirname(full), { recursive: true });
	await writeFile(full, content);
}

async function writeCheckoutWebFixture(): Promise<void> {
	await write(
		"package.json",
		JSON.stringify({
			name: "checkout-web",
			scripts: {
				"generate:api":
					"openapi-typescript ../../services/orders/openapi.json -o src/lib/orders-api.d.ts",
			},
		}),
	);
	await write("tsconfig.json", "{}");
	await write("src/lib/orders-api.d.ts", "export interface paths {}\n");
	await write(
		"src/lib/orders-client.ts",
		[
			'import createClient from "openapi-fetch";',
			'import type { paths } from "./orders-api.js";',
			"",
			"export const ordersClient = createClient<paths>({",
			'  baseUrl: process.env.ORDERS_API_URL ?? "http://127.0.0.1:8001",',
			"});",
			"",
		].join("\n"),
	);
	await write(
		"src/app/page.tsx",
		"export default function Page() { return null; }\n",
	);
}

beforeEach(async () => {
	root = await mkdtemp(path.join(tmpdir(), "schemend-lang-ts-fixtures-"));
});

afterEach(async () => {
	await rm(root, { recursive: true, force: true });
});

describe("discoverApis", () => {
	it("finds an API from an openapi-typescript generate script", async () => {
		await writeCheckoutWebFixture();

		const entries = await discoverApis({
			root,
			exec: async () => ({ exitCode: 0, stdout: "", stderr: "" }),
		});

		expect(entries).toHaveLength(1);
		expect(entries[0]).toMatchObject({
			name: "orders",
			kind: "internal",
			source: {
				type: "openapi",
				location: "../../services/orders/openapi.json",
			},
			usedIn: ["src/lib"],
		});
	});

	it("records the generate script and matching env var as evidence", async () => {
		await writeCheckoutWebFixture();

		const [entry] = await discoverApis({
			root,
			exec: async () => ({ exitCode: 0, stdout: "", stderr: "" }),
		});

		expect(entry?.evidence).toContain("package.json script generate:api");
		expect(entry?.evidence).toContain(
			"env ORDERS_API_URL in src/lib/orders-client.ts",
		);
	});

	it("only counts files that directly import the generated client toward usedIn", async () => {
		await writeCheckoutWebFixture();
		// References the API by name/env var but never imports the generated client.
		await write(
			"src/app/other.ts",
			"const url = process.env.ORDERS_API_URL;\n",
		);

		const [entry] = await discoverApis({
			root,
			exec: async () => ({ exitCode: 0, stdout: "", stderr: "" }),
		});

		expect(entry?.usedIn).toEqual(["src/lib"]);
	});

	it("ignores matches inside node_modules", async () => {
		await writeCheckoutWebFixture();
		await write(
			"node_modules/some-dep/fake.ts",
			'import type { paths } from "./orders-api.js";\n',
		);

		const [entry] = await discoverApis({
			root,
			exec: async () => ({ exitCode: 0, stdout: "", stderr: "" }),
		});

		expect(entry?.usedIn).toEqual(["src/lib"]);
	});

	it("returns an empty list when no generate script is found", async () => {
		await write(
			"package.json",
			JSON.stringify({ name: "no-api", scripts: {} }),
		);

		const entries = await discoverApis({
			root,
			exec: async () => ({ exitCode: 0, stdout: "", stderr: "" }),
		});

		expect(entries).toEqual([]);
	});

	it("returns an empty list when there is no package.json", async () => {
		const entries = await discoverApis({
			root,
			exec: async () => ({ exitCode: 0, stdout: "", stderr: "" }),
		});

		expect(entries).toEqual([]);
	});
});

describe("detect", () => {
	it("is true when package.json and tsconfig.json are both present", async () => {
		await writeCheckoutWebFixture();

		expect(await detect(root)).toBe(true);
	});

	it("is false when tsconfig.json is missing", async () => {
		await write("package.json", JSON.stringify({ name: "no-tsconfig" }));

		expect(await detect(root)).toBe(false);
	});

	it("is false for an empty directory", async () => {
		expect(await detect(root)).toBe(false);
	});
});

describe("regenerateClient", () => {
	const api = {
		name: "orders",
		kind: "internal" as const,
		source: {
			type: "openapi" as const,
			location: "../../services/orders/openapi.json",
		},
		usedIn: ["src/lib"],
	};

	it("runs the generate script matching the api's schema path", async () => {
		await writeCheckoutWebFixture();
		let command = "";
		const exec = async (cmd: string) => {
			command = cmd;
			return { exitCode: 0, stdout: "", stderr: "" };
		};

		await regenerateClient({ root, exec }, api);

		expect(command).toBe("pnpm run generate:api");
	});

	it("throws when the generate script fails", async () => {
		await writeCheckoutWebFixture();
		const exec = async () => ({
			exitCode: 1,
			stdout: "",
			stderr: "schema not found",
		});

		await expect(regenerateClient({ root, exec }, api)).rejects.toThrow(
			/schema not found/,
		);
	});

	it("throws when no generate script matches the api's schema path", async () => {
		await writeCheckoutWebFixture();
		const otherApi = {
			...api,
			source: { type: "openapi" as const, location: "../other/openapi.json" },
		};
		const exec = async () => ({ exitCode: 0, stdout: "", stderr: "" });

		await expect(regenerateClient({ root, exec }, otherApi)).rejects.toThrow(
			/no openapi-typescript generate script/,
		);
	});

	it("does nothing for a non-openapi (external package) source", async () => {
		const packageApi = {
			name: "firebase",
			kind: "external" as const,
			source: {
				type: "package" as const,
				ecosystem: "npm" as const,
				name: "firebase",
				version: "9.0.0",
			},
			usedIn: [],
		};
		let called = false;
		const exec = async () => {
			called = true;
			return { exitCode: 0, stdout: "", stderr: "" };
		};

		await regenerateClient({ root, exec }, packageApi);

		expect(called).toBe(false);
	});
});
