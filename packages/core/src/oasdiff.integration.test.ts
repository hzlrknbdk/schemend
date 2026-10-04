import { exec as execCallback } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { ExecResult } from "./context.js";
import { diffSchemas } from "./oasdiff.js";

// Real exec, same contract as AdapterContext.exec: never rejects, a non-zero exit is just data.
function realExec(command: string): Promise<ExecResult> {
	return new Promise((resolve) => {
		execCallback(
			command,
			{ maxBuffer: 20 * 1024 * 1024 },
			(error, stdout, stderr) => {
				resolve({
					exitCode: !error
						? 0
						: typeof error.code === "number"
							? error.code
							: 1,
					stdout,
					stderr,
				});
			},
		);
	});
}

async function dockerAvailable(): Promise<boolean> {
	const result = await realExec("docker info");
	return result.exitCode === 0;
}

const scenarioDir = path.resolve(
	path.dirname(fileURLToPath(import.meta.url)),
	"../../../eval/scenarios/field-to-object",
);

describe.runIf(await dockerAvailable())("diffSchemas (real Docker)", () => {
	it("finds at least one breaking change in the field-to-object fixture", async () => {
		const changes = await diffSchemas(
			path.join(scenarioDir, "schema.before.json"),
			path.join(scenarioDir, "schema.after.json"),
			realExec,
		);

		expect(changes.length).toBeGreaterThan(0);
		expect(changes.some((change) => change.severity === "breaking")).toBe(true);
	}, 60_000);
});
