import { copyFile, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import type { Exec } from "./context.js";
import type { ApiChange } from "./types.js";

// Pinned, not :latest, so a diff's output doesn't change out from under us when oasdiff ships
// new checks. Bump deliberately and re-verify the JSON shape below against the new release.
const OASDIFF_IMAGE = "tufin/oasdiff:v1.33.0";

/** Thrown when Docker itself isn't usable (daemon down, or the docker CLI isn't installed). */
export class DockerUnavailableError extends Error {
	constructor() {
		super("Docker is not running. Start Docker Desktop and try again.");
		this.name = "DockerUnavailableError";
	}
}

// Shape of one entry in `oasdiff changelog -f json`'s output array, as defined by
// formatters.Change in github.com/oasdiff/oasdiff (verified against v1.33.0 source: only the
// fields we use are listed, the rest are omitempty and irrelevant here).
interface OasdiffChange {
	id?: string;
	text?: string;
	// checker/rules.Level: ERR=3, WARN=2, INFO=1, NONE=0, INVALID=-1. No omitempty, always present.
	level: number;
	operation?: string;
	path?: string;
	section?: string;
}

const BREAKING_LEVEL_THRESHOLD = 2; // WARN and ERR are breaking; INFO and NONE are not.

function severityFor(level: number): ApiChange["severity"] {
	return level >= BREAKING_LEVEL_THRESHOLD ? "breaking" : "non-breaking";
}

function targetFor(change: OasdiffChange): string {
	const opAndPath = [change.operation, change.path].filter(Boolean).join(" ");
	return opAndPath || change.section || change.id || "unknown";
}

// oasdiff's own `id` names the check that fired (e.g. "request-body-type-changed"), not a
// per-instance identifier: the same check fires once per affected operation/path, so two
// instances can share it. Combine it with operation/path and the array index to get an id
// that's actually unique within the returned list.
function uniqueId(change: OasdiffChange, index: number): string {
	const parts = [change.id, change.operation, change.path].filter(Boolean);
	return `${parts.length > 0 ? parts.join(":") : "change"}#${index}`;
}

function toApiChange(change: OasdiffChange, index: number): ApiChange {
	return {
		id: uniqueId(change, index),
		severity: severityFor(change.level),
		summary: change.text ?? "",
		target: targetFor(change),
		source: {
			tool: "oasdiff",
			id: change.id ?? "unknown",
			level: change.level,
		},
	};
}

/**
 * Diffs two OpenAPI schema files with oasdiff's Docker image (SPEC §2 step 2). Copies both files
 * into a throwaway temp directory as old.json/new.json before mounting it read-only into the
 * container, so the container only ever sees the two schemas, never their surrounding directory.
 * exec is injected so core never spawns Docker itself (same pattern as AdapterContext.exec).
 */
export async function diffSchemas(
	oldSchemaPath: string,
	newSchemaPath: string,
	exec: Exec,
): Promise<ApiChange[]> {
	const preflight = await exec("docker info");
	if (preflight.exitCode !== 0) {
		throw new DockerUnavailableError();
	}

	const tempDir = await mkdtemp(path.join(tmpdir(), "schemend-oasdiff-"));
	try {
		await copyFile(oldSchemaPath, path.join(tempDir, "old.json"));
		await copyFile(newSchemaPath, path.join(tempDir, "new.json"));

		const command = `docker run --rm -v "${tempDir}:/specs:ro" -w /specs ${OASDIFF_IMAGE} changelog old.json new.json -f json`;
		const result = await exec(command);
		if (result.exitCode !== 0) {
			throw new Error(
				`oasdiff failed (exit ${result.exitCode}): ${result.stderr || result.stdout}`,
			);
		}

		const changes: OasdiffChange[] = JSON.parse(result.stdout);
		return changes.map(toApiChange);
	} finally {
		await rm(tempDir, { recursive: true, force: true });
	}
}
