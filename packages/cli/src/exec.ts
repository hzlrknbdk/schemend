import { exec as execCallback } from "node:child_process";
import type { ExecResult } from "@schemend/core";

const MAX_BUFFER_BYTES = 20 * 1024 * 1024;

/** Real process-spawning exec for the CLI; never rejects, same contract as AdapterContext.exec. */
export function realExec(command: string): Promise<ExecResult> {
	return new Promise((resolve) => {
		execCallback(
			command,
			{ maxBuffer: MAX_BUFFER_BYTES },
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
