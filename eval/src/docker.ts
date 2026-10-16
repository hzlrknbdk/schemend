import type { ContainerUser, Exec, LanguageAdapter } from "@schemend/core";
import { ensureDockerCtx, pickAdapter } from "@schemend/core";

export interface ConsumerDockerExec {
  /** For both scenario.json's `setup` and `checks` commands - broad mount (repo root read-only + consumer read-write), network none, matching the real product's build/test (SPEC §6, DECISIONS.md). */
  exec: Exec;
  /** Removes the exact dependency volume ensureDockerCtx created for this consumer. Best-effort, never throws (same reasoning as pruneStaleDependencyVolumes). */
  cleanup: () => Promise<void>;
}

/** Builds a Docker-backed exec for one consumer, picking its LanguageAdapter the same way `schemend check` does and reusing ensureDockerCtx verbatim. Never falls back to a plain host exec. */
export function createConsumerExecFactory(
  adapters: LanguageAdapter[],
  hostExec: Exec,
  containerUser: ContainerUser | undefined,
): (dir: string, repoRoot: string) => Promise<ConsumerDockerExec> {
  return async (dir, repoRoot) => {
    const adapter = await pickAdapter(adapters, dir);
    if (!adapter) {
      throw new Error(`no language adapter recognized the project at ${dir}`);
    }

    const { ctx, volume } = await ensureDockerCtx(
      adapter,
      dir,
      repoRoot,
      hostExec,
      undefined,
      containerUser,
    );

    return {
      exec: ctx.exec,
      cleanup: async () => {
        await hostExec(`docker volume rm ${volume}`);
      },
    };
  };
}
