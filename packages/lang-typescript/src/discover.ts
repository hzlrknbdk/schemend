import { access, readdir, readFile } from "node:fs/promises";
import path from "node:path";
import type { AdapterContext, ApiEntry } from "@schemend/core";

const SKIP_DIRS = new Set(["node_modules", ".git", ".next", ".turbo", "dist"]);

/**
 * Matches an openapi-typescript generate script, e.g.
 * "openapi-typescript ../../services/orders/openapi.json -o src/lib/orders-api.d.ts".
 * Other generators (orval, openapi-generator-cli) are not recognized yet (see docs/PLAN.md v1.1).
 */
const GENERATE_SCRIPT_RE =
	/openapi-typescript\s+(\S+)\s+(?:-o|--output)\s+(\S+)/;

/** e.g. "process.env.ORDERS_API_URL"; recorded as evidence only, never part of usedIn. */
const ENV_API_URL_RE = /process\.env\.([A-Z0-9_]+_API_URL)/g;

interface GeneratedClient {
	scriptName: string;
	schemaPath: string;
	outputPath: string;
}

function escapeRegExp(value: string): string {
	return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

async function readPackageScripts(
	root: string,
): Promise<Record<string, string>> {
	const raw = await readFile(path.join(root, "package.json"), "utf-8").catch(
		() => undefined,
	);
	if (!raw) return {};
	const pkg = JSON.parse(raw) as { scripts?: Record<string, string> };
	return pkg.scripts ?? {};
}

function findGeneratedClients(
	scripts: Record<string, string>,
): GeneratedClient[] {
	const clients: GeneratedClient[] = [];
	for (const [scriptName, command] of Object.entries(scripts)) {
		const match = command.match(GENERATE_SCRIPT_RE);
		const schemaPath = match?.[1];
		const outputPath = match?.[2];
		if (!schemaPath || !outputPath) continue;
		clients.push({ scriptName, schemaPath, outputPath });
	}
	return clients;
}

async function listSourceFiles(dir: string): Promise<string[]> {
	const entries = await readdir(dir, { withFileTypes: true });
	const files: string[] = [];
	for (const entry of entries) {
		if (SKIP_DIRS.has(entry.name)) continue;
		const full = path.join(dir, entry.name);
		if (entry.isDirectory()) {
			files.push(...(await listSourceFiles(full)));
			continue;
		}
		if (/\.tsx?$/.test(entry.name) && !entry.name.endsWith(".d.ts")) {
			files.push(full);
		}
	}
	return files;
}

function buildEntry(
	root: string,
	client: GeneratedClient,
	contentsByFile: Map<string, string>,
): ApiEntry {
	const name = path.basename(path.dirname(client.schemaPath));
	const outputBase = path
		.basename(client.outputPath)
		.replace(/\.d\.ts$/, "")
		.replace(/\.ts$/, "");
	const importRe = new RegExp(
		`from\\s+["'][^"']*${escapeRegExp(outputBase)}(?:\\.js)?["']`,
	);

	const usedInDirs = new Set<string>();
	const evidence = [`package.json script ${client.scriptName}`];

	for (const [file, content] of contentsByFile) {
		const relFile = path.relative(root, file);

		if (importRe.test(content)) {
			usedInDirs.add(path.dirname(relFile));
		}

		for (const match of content.matchAll(ENV_API_URL_RE)) {
			const envVar = match[1];
			if (envVar?.startsWith(name.toUpperCase())) {
				evidence.push(`env ${envVar} in ${relFile}`);
			}
		}
	}

	return {
		name,
		kind: "internal",
		source: { type: "openapi", location: client.schemaPath },
		usedIn: [...usedInDirs].sort(),
		evidence,
	};
}

/**
 * Finds APIs a TypeScript project calls (SPEC §2 step 1): an openapi-typescript generate script
 * in package.json gives the API name and schema location; source files importing the generated
 * client give a rough `usedIn` (SPEC §4 note: real impact analysis is findAffected's typecheck
 * scan, not this list). Env var references (e.g. ORDERS_API_URL) are recorded as extra evidence
 * only, for `schemend init`'s discovery confirmation.
 */
export async function discoverApis(ctx: AdapterContext): Promise<ApiEntry[]> {
	const scripts = await readPackageScripts(ctx.root);
	const clients = findGeneratedClients(scripts);
	if (clients.length === 0) return [];

	const sourceFiles = await listSourceFiles(ctx.root);
	const contentsByFile = new Map<string, string>();
	for (const file of sourceFiles) {
		contentsByFile.set(file, await readFile(file, "utf-8"));
	}

	return clients.map((client) => buildEntry(ctx.root, client, contentsByFile));
}

async function exists(file: string): Promise<boolean> {
	try {
		await access(file);
		return true;
	} catch {
		return false;
	}
}

/** True when root looks like a TypeScript project (package.json + tsconfig.json present). */
export async function detect(root: string): Promise<boolean> {
	const [hasPackageJson, hasTsconfig] = await Promise.all([
		exists(path.join(root, "package.json")),
		exists(path.join(root, "tsconfig.json")),
	]);
	return hasPackageJson && hasTsconfig;
}
