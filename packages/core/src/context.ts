export interface ExecResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

/**
 * Runs a shell command and resolves with its result; never rejects on a non-zero exit. The
 * optional `env` is merged into the child process's environment for that one call only (never
 * persisted to disk or echoed into the command string) - used by the GitHub adapter's push to pass
 * a one-shot `GIT_CONFIG_*` auth header without the token ever appearing in argv.
 */
export type Exec = (
  command: string,
  env?: Record<string, string>,
) => Promise<ExecResult>;

export interface AdapterContext {
  root: string;
  exec: Exec;
  /**
   * The host path a Docker-backed exec mounts at /workspace (see ensureDockerCtx, check.ts) -
   * only set when exec actually runs inside a container; absent for the plain host exec used for
   * git operations, which never produces a /workspace-prefixed path to translate. Adapters whose
   * exec output embeds absolute paths (e.g. a compiler error) need this to map them back to a
   * real host path via resolveContainerPath (docker-exec.ts) before returning them to core.
   */
  repoRoot?: string;
}
