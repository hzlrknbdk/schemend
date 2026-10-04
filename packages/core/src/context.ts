/** Result of running a shell command; identical shape whether it ran in Docker or locally. */
export interface ExecResult {
	exitCode: number;
	stdout: string;
	stderr: string;
}

/** Given to every LanguageAdapter method; adapters run commands only through ctx.exec, never by spawning processes themselves. */
export interface AdapterContext {
	root: string;
	exec(command: string): Promise<ExecResult>;
}
