import { access, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Exec, ExecResult } from "./context.js";
import { DockerUnavailableError, diffSchemas } from "./oasdiff.js";

// diffSchemas copies these from real paths before ever touching Docker, so every test needs
// actual files on disk; their content doesn't matter since the docker run itself is faked below.
let oldSchemaPath: string;
let newSchemaPath: string;
let fixturesDir: string;

beforeAll(async () => {
	fixturesDir = await mkdtemp(
		path.join(tmpdir(), "schemend-oasdiff-fixtures-"),
	);
	oldSchemaPath = path.join(fixturesDir, "old.json");
	newSchemaPath = path.join(fixturesDir, "new.json");
	await writeFile(oldSchemaPath, "{}");
	await writeFile(newSchemaPath, "{}");
});

afterAll(async () => {
	await rm(fixturesDir, { recursive: true, force: true });
});

function ok(stdout: string): ExecResult {
	return { exitCode: 0, stdout, stderr: "" };
}

function failed(stderr: string, exitCode = 1): ExecResult {
	return { exitCode, stdout: "", stderr };
}

const SAMPLE_CHANGES = [
	{
		id: "request-body-type-changed",
		text: "the request body's media type has changed",
		level: 3,
		operation: "POST",
		path: "/orders",
	},
	{
		id: "response-property-removed",
		text: "'totalPrice' was removed from the response",
		level: 2,
		operation: "GET",
		path: "/orders/{id}",
	},
	{
		id: "endpoint-description-changed",
		text: "description changed",
		level: 1,
		operation: "GET",
		path: "/orders",
	},
];

// Extracts the `-v "<dir>:/specs:ro"` mount path from a captured docker command, so tests can
// assert the temp dir was actually used (and later removed) without diffSchemas exposing it.
function mountDirFrom(command: string): string {
	const match = command.match(/-v "(.+?):\/specs:ro"/);
	if (!match?.[1]) throw new Error(`no mount dir found in: ${command}`);
	return match[1];
}

describe("diffSchemas", () => {
	it("maps oasdiff's changelog JSON into ApiChange[]", async () => {
		const exec: Exec = async (command) => {
			if (command === "docker info") return ok("");
			return ok(JSON.stringify(SAMPLE_CHANGES));
		};

		const changes = await diffSchemas(oldSchemaPath, newSchemaPath, exec);

		expect(changes).toHaveLength(3);
		expect(changes[0]).toMatchObject({
			severity: "breaking", // level 3 (ERR)
			target: "POST /orders",
			source: { tool: "oasdiff", id: "request-body-type-changed", level: 3 },
		});
		expect(changes[1]).toMatchObject({ severity: "breaking" }); // level 2 (WARN)
		expect(changes[2]).toMatchObject({ severity: "non-breaking" }); // level 1 (INFO)
	});

	it("gives each change a unique id even when oasdiff reuses the same check id", async () => {
		const exec: Exec = async (command) =>
			command === "docker info"
				? ok("")
				: ok(
						JSON.stringify([
							{
								id: "response-property-removed",
								level: 2,
								operation: "GET",
								path: "/a",
							},
							{
								id: "response-property-removed",
								level: 2,
								operation: "GET",
								path: "/b",
							},
						]),
					);

		const changes = await diffSchemas(oldSchemaPath, newSchemaPath, exec);

		expect(changes[0]?.id).not.toBe(changes[1]?.id);
	});

	it("falls back to section, then the check id, when operation/path are absent", async () => {
		const exec: Exec = async (command) =>
			command === "docker info"
				? ok("")
				: ok(
						JSON.stringify([
							{ id: "schema-removed", level: 3, section: "components" },
						]),
					);

		const changes = await diffSchemas(oldSchemaPath, newSchemaPath, exec);

		expect(changes[0]?.target).toBe("components");
	});

	it("copies both schemas into the mounted temp dir and removes it afterwards", async () => {
		let capturedMountDir: string | undefined;
		const exec: Exec = async (command) => {
			if (command === "docker info") return ok("");
			capturedMountDir = mountDirFrom(command);
			return ok("[]");
		};

		await diffSchemas(oldSchemaPath, newSchemaPath, exec);

		expect(capturedMountDir).toBeDefined();
		await expect(access(capturedMountDir as string)).rejects.toThrow();
	});

	it("throws DockerUnavailableError when the daemon preflight fails", async () => {
		const exec: Exec = async () =>
			failed("Cannot connect to the Docker daemon", 1);

		await expect(
			diffSchemas(oldSchemaPath, newSchemaPath, exec),
		).rejects.toThrow(DockerUnavailableError);
	});

	it("throws a descriptive error when the diff command itself fails", async () => {
		const exec: Exec = async (command) =>
			command === "docker info"
				? ok("")
				: failed("invalid schema: new.json", 1);

		await expect(
			diffSchemas(oldSchemaPath, newSchemaPath, exec),
		).rejects.toThrow(/invalid schema/);
	});
});
