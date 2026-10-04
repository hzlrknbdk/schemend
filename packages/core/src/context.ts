/** Result of running a shell command; identical shape whether it ran in Docker or locally. */
export interface ExecResult {
	exitCode: number;
	stdout: string;
	stderr: string;
}

/** Runs a shell command and resolves with its result; never rejects on a non-zero exit. */
export type Exec = (command: string) => Promise<ExecResult>;

/** Given to every LanguageAdapter method; adapters run commands only through ctx.exec, never by spawning processes themselves. */
export interface AdapterContext {
	root: string;
	exec: Exec;
}
