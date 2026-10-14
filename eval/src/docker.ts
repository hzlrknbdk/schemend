import type { ContainerUser, Exec, LanguageAdapter } from "@schemend/core";
import { createDockerExec, ensureDockerCtx, pickAdapter } from "@schemend/core";

export interface ConsumerDockerExec {
  /** For scenario.json's `setup` commands (client generation, typegen, ...) - network bridge, same as the real product's own dependency install. */
  setupExec: Exec;
  /** For scenario.json's `checks` commands - network none, matching the real product's build/test (SPEC §6). */
  checkExec: Exec;
  /** Removes the exact dependency volume ensureDockerCtx created for this consumer. Best-effort, never throws (same reasoning as pruneStaleDependencyVolumes). */
  cleanup: () => Promise<void>;
}

/**
 * Builds a Docker-backed exec for one consumer directory, picking its LanguageAdapter the same
 * way `schemend check` does (pickAdapter, detect(root) tried in order) and reusing
 * ensureDockerCtx's image/volume/install setup verbatim. Never falls back to a plain host exec:
 * if Docker itself is unreachable, the underlying docker command throws and that propagates as-is
 * - callers in production must not catch it and silently retry on the host.
 */
export function createConsumerExecFactory(
  adapters: LanguageAdapter[],
  hostExec: Exec,
  containerUser: ContainerUser | undefined,
): (dir: string) => Promise<ConsumerDockerExec> {
  return async (dir) => {
    const adapter = await pickAdapter(adapters, dir);
    if (!adapter) {
      throw new Error(`no language adapter recognized the project at ${dir}`);
    }

    const { ctx, volume } = await ensureDockerCtx(
      adapter,
      dir,
      hostExec,
      undefined,
      containerUser,
    );

    const setupExec = createDockerExec(hostExec, dir, adapter.dockerImage, {
      network: "bridge",
      volumes: { [volume]: adapter.dependencyVolumePath },
      ...(containerUser !== undefined ? { user: containerUser } : {}),
    });

    return {
      setupExec,
      checkExec: ctx.exec,
      cleanup: async () => {
        await hostExec(`docker volume rm ${volume}`);
      },
    };
  };
}
