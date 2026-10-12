export interface ExecResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

/** Runs a shell command and resolves with its result; never rejects on a non-zero exit. */
export type Exec = (command: string) => Promise<ExecResult>;

export interface AdapterContext {
  root: string;
  exec: Exec;
}
