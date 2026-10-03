import { exec } from "node:child_process";

export interface CommandResult {
	exitCode: number;
	stdout: string;
	stderr: string;
}

const DEFAULT_TIMEOUT_MS = 5 * 60 * 1000;
const MAX_BUFFER_BYTES = 20 * 1024 * 1024;
// Matches the conventional `timeout` command's exit code, so a timed-out check reads
// the same in the report as it would on a shell.
const TIMEOUT_EXIT_CODE = 124;

// Never rejects: a non-zero exit is a normal outcome callers need to inspect
// (a failing check, a failing install), not an exceptional one. exitCode is
// always a finite number, including when the command times out or is killed.
export function runCommand(
	command: string,
	cwd: string,
	timeoutMs = DEFAULT_TIMEOUT_MS,
): Promise<CommandResult> {
	return new Promise((resolve) => {
		exec(
			command,
			{ cwd, timeout: timeoutMs, maxBuffer: MAX_BUFFER_BYTES },
			(error, stdout, stderr) => {
				const exitCode = !error
					? 0
					: error.killed || error.signal != null
						? TIMEOUT_EXIT_CODE
						: typeof error.code === "number"
							? error.code
							: 1;
				resolve({ exitCode, stdout, stderr });
			},
		);
	});
}
