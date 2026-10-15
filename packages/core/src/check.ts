import { readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { runFixAgent } from "./agent.js";
import { Budget, BudgetExceededError } from "./budget.js";
import type { Config } from "./config.js";
import type { AdapterContext, Exec } from "./context.js";
import {
  assertStandaloneProject,
  type ContainerUser,
  chownDependencyVolume,
  createDockerExec,
  dependencyVolumeName,
  ensureContainerDeps,
  ensureDockerImage,
  pruneStaleDependencyVolumes,
  rebaseDependencyVolumePath,
} from "./docker-exec.js";
import type { CheckEvent } from "./events.js";
import { createEventEmitter, EVENT_SCHEMA_VERSION } from "./events.js";
import { findRepoRoot, writeFileAtRef } from "./git.js";
import type { LanguageAdapter } from "./language-adapter.js";
import { DockerUnavailableError, diffSchemas } from "./oasdiff.js";
import type {
  ApiChange,
  ApiEntry,
  CheckResult,
  Confidence,
  ReviewItem,
  RunReport,
  ServiceResult,
} from "./types.js";

export interface RunCheckOptions {
  config: Config;
  root: string;
  exec: Exec;
  /** Tried in order; the first one whose detect(root) returns true is used for every api. */
  adapters: LanguageAdapter[];
  baseRef?: string;
  onEvent?: (event: CheckEvent) => void;
  abortController?: AbortController;
  containerUser?: ContainerUser;
}

const BRANCH_NAME = "schemend/update";

function isCancelled(abortController: AbortController | undefined): boolean {
  return abortController?.signal.aborted === true;
}

export async function pickAdapter(
  adapters: LanguageAdapter[],
  root: string,
): Promise<LanguageAdapter | undefined> {
  for (const adapter of adapters) {
    if (await adapter.detect(root)) return adapter;
  }
  return undefined;
}

function toApiEntry(apiConfig: Config["apis"][number]): ApiEntry {
  return {
    name: apiConfig.name,
    kind: "internal",
    source: { type: "openapi", location: apiConfig.schema },
    usedIn: apiConfig.usedIn,
  };
}

function confidenceFrom(build: CheckResult, test: CheckResult): Confidence {
  if (test.status === "passed") return "verified-by-tests";
  if (build.status === "passed") return "verified-by-build";
  return "unverified";
}

async function ensureBranch(ctx: AdapterContext): Promise<void> {
  const created = await ctx.exec(`git checkout -b ${BRANCH_NAME}`);
  if (created.exitCode !== 0) {
    await ctx.exec(`git checkout ${BRANCH_NAME}`);
  }
}

/**
 * Builds the Docker-backed AdapterContext build/test run through (SPEC §4/§6): ensures the
 * adapter's image and dependency volume exist, prunes any older volume for this same root, then
 * returns a context whose exec runs with that volume mounted and the network disabled.
 *
 * Both install and the returned exec mount `repoRoot` read-only at /workspace, with `root`
 * layered read-write on top at its real position under it, cwd'd there - not just `root` alone -
 * so a sibling schema reference (SPEC §5's "../orders/openapi.json") resolves correctly
 * regardless of how many `../` segments it takes to get there. They differ only in network:
 * install gets the registry (`bridge`), the final exec is `none` - see DECISIONS.md. This is why
 * install needs its own visibility check: unlike the final exec, it runs with network access, so
 * `assertDockerVisibility` validates anything a pom.xml/build file points to before any of this
 * is mounted into a container that can reach the internet.
 */
export interface DockerCtx {
  ctx: AdapterContext;
  /** The exact dependency volume ensureDockerCtx created/reused for `root` - callers that need to remove it (eval's per-run cleanup) must use this name, never a prefix/listing match. */
  volume: string;
}

export async function ensureDockerCtx(
  adapter: LanguageAdapter,
  root: string,
  repoRoot: string,
  exec: Exec,
  abortController: AbortController | undefined,
  containerUser: ContainerUser | undefined,
): Promise<DockerCtx> {
  const lockfile =
    typeof adapter.lockfile === "function"
      ? await adapter.lockfile(root)
      : adapter.lockfile;

  await assertStandaloneProject(root, lockfile, adapter.workspaceMarkers);
  if (adapter.assertSupportedLayout) {
    await adapter.assertSupportedLayout(root);
  }
  if (adapter.assertDockerVisibility) {
    await adapter.assertDockerVisibility(root, repoRoot);
  }

  const containerConsumerPath = path.posix.join(
    "/workspace",
    path.relative(repoRoot, root),
  );
  const volumeTarget = rebaseDependencyVolumePath(
    adapter.dependencyVolumePath,
    containerConsumerPath,
  );

  const volume = await dependencyVolumeName(root, path.join(root, lockfile));
  await ensureDockerImage(exec, adapter.dockerImage, adapter.dockerfile);
  await pruneStaleDependencyVolumes(exec, root, volume);
  if (containerUser) {
    await chownDependencyVolume(
      exec,
      adapter.dockerImage,
      volume,
      adapter.dependencyVolumePath,
      containerUser,
    );
  }

  const sharedMountOptions = {
    readOnlyRoot: true as const,
    extraMounts: [
      { source: root, target: containerConsumerPath, readOnly: false },
    ],
    cwd: containerConsumerPath,
    ...(abortController !== undefined ? { abortController } : {}),
    ...(containerUser !== undefined ? { user: containerUser } : {}),
  };

  const installCommand =
    typeof adapter.installCommand === "function"
      ? await adapter.installCommand(root)
      : adapter.installCommand;

  await ensureContainerDeps({
    exec,
    root: repoRoot,
    image: adapter.dockerImage,
    volume,
    volumeTarget,
    installCommand,
    ...sharedMountOptions,
  });
  return {
    ctx: {
      root,
      repoRoot,
      exec: createDockerExec(exec, repoRoot, adapter.dockerImage, {
        network: "none",
        volumes: { [volume]: volumeTarget },
        ...sharedMountOptions,
      }),
    },
    volume,
  };
}

/**
 * Stages everything under ctx.root and commits it if there's anything to commit. `--relative`
 * keeps the reported paths relative to ctx.root even when it's a subdirectory of the repo, same
 * as every other path this package produces (findAffected, discoverApis, ...).
 */
async function commitAll(
  ctx: AdapterContext,
  message: string,
): Promise<string[]> {
  await ctx.exec("git add -A .");
  const staged = await ctx.exec("git diff --name-only --cached --relative");
  const changedFiles = staged.stdout
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  if (changedFiles.length === 0) return [];

  const commit = await ctx.exec(`git commit -q -m "${message}"`);
  return commit.exitCode === 0 ? changedFiles : [];
}

/**
 * `schemend check` (SPEC §9): the local, no-push half of the SPEC §2 flow (steps 2-7) for one
 * consumer. Shares one Budget across every api in config.apis (SPEC §6: stop once it's gone,
 * report the rest). All fixes for this run land as commits on one local branch, matching "one PR
 * per consumer service" (SPEC §2 step 7) - `schemend run` pushes it and opens that PR.
 */
export async function runCheck(options: RunCheckOptions): Promise<RunReport> {
  const { config, root, exec, adapters } = options;
  const baseRef = options.baseRef ?? "HEAD~1";
  const ctx: AdapterContext = { root, exec };
  const budget = new Budget(config.budgetUsd);
  const service = path.basename(path.resolve(root));
  const emit = createEventEmitter(options.onEvent);

  const adapter = await pickAdapter(adapters, root);
  if (!adapter) {
    throw new Error(`no language adapter recognized the project at ${root}`);
  }

  const startedAt = new Date().toISOString();
  const allChanges: ApiChange[] = [];
  const services: ServiceResult[] = [];
  let branchReady = false;
  let dockerCtxCache: AdapterContext | undefined;
  let stoppedReason: string | undefined;

  emit({
    type: "run-started",
    eventSchemaVersion: EVENT_SCHEMA_VERSION,
    apis: config.apis.map((apiConfig) => apiConfig.name),
    budgetUsd: config.budgetUsd,
  });

  for (const apiConfig of config.apis) {
    const api = apiConfig.name;

    if (isCancelled(options.abortController)) {
      stoppedReason = "cancelled";
      break;
    }

    const detectStartedAt = Date.now();
    emit({ type: "step-started", api, step: "detect" });

    let oldSchemaFile: string;
    try {
      oldSchemaFile = await writeFileAtRef(baseRef, apiConfig.schema, exec);
    } catch (error) {
      emit({
        type: "step-finished",
        api,
        step: "detect",
        durationMs: Date.now() - detectStartedAt,
        status: "failed",
        reason: "schema-read-failed",
      });
      const result: ServiceResult = {
        service,
        language: adapter.id,
        branch: "",
        steps: ["detect"],
        changedFiles: [],
        checks: [],
        review: [
          {
            file: apiConfig.schema,
            reason: `could not read the previous schema: ${error instanceof Error ? error.message : String(error)}`,
          },
        ],
        confidence: "unverified",
        costUsd: 0,
      };
      services.push(result);
      emit({ type: "service-completed", api, service: result });
      continue;
    }

    const newSchemaFile = path.resolve(root, apiConfig.schema);
    const oldSchemaContent = await readFile(oldSchemaFile, "utf-8");
    let changes: ApiChange[];
    try {
      try {
        changes = await diffSchemas(oldSchemaFile, newSchemaFile, exec);
      } catch (error) {
        if (error instanceof DockerUnavailableError) {
          emit({
            type: "step-finished",
            api,
            step: "detect",
            durationMs: Date.now() - detectStartedAt,
            status: "failed",
            reason: "docker-unavailable",
          });
        }
        throw error;
      }
    } finally {
      await rm(path.dirname(oldSchemaFile), { recursive: true, force: true });
    }

    if (changes.length === 0) {
      emit({
        type: "step-finished",
        api,
        step: "detect",
        durationMs: Date.now() - detectStartedAt,
        status: "passed",
      });
      continue;
    }
    allChanges.push(...changes);
    emit({ type: "changes-detected", api, changes });
    emit({
      type: "step-finished",
      api,
      step: "detect",
      durationMs: Date.now() - detectStartedAt,
      status: "passed",
    });

    const apiEntry = toApiEntry(apiConfig);

    // SPEC §2 step 3: baseline BEFORE anything (including regeneration) changes.
    const baselineStartedAt = Date.now();
    emit({ type: "step-started", api, step: "baseline" });
    // Swapped to the old schema before ensureDockerCtx, not just around the build/test calls
    // below - Java's installCommand (a real `mvn test` warm-up, see DECISIONS.md) regenerates
    // the client and compiles against whatever's on `newSchemaFile` too, on a fresh dependency
    // volume's first run. With the new (breaking) schema still in place at that point, the
    // warm-up's own compile fails before Maven ever reaches the test phase, so surefire's own
    // plugin dependencies never get resolved into the volume; the real baseline build then
    // compiles fine against the swapped-back old schema, but its --network none test call fails
    // to resolve those never-cached dependencies - a dependency-resolution error that looks
    // nothing like the schema change, discovered via a real paid milestone run against
    // services/invoice. The restore stays unconditional so a thrown/cancelled run never leaves
    // the real schema file swapped out.
    const currentSchemaContent = await readFile(newSchemaFile, "utf-8");
    await writeFile(newSchemaFile, oldSchemaContent);
    let baselineBuild: CheckResult;
    let baselineTest: CheckResult;
    let dockerCtx: AdapterContext;
    try {
      if (!dockerCtxCache) {
        const repoRoot = await findRepoRoot(exec);
        ({ ctx: dockerCtxCache } = await ensureDockerCtx(
          adapter,
          root,
          repoRoot,
          exec,
          options.abortController,
          options.containerUser,
        ));
      }
      dockerCtx = dockerCtxCache;
      baselineBuild = await adapter.build(dockerCtx);
      emit({ type: "check-result", api, check: baselineBuild });
      baselineTest = await adapter.test(dockerCtx);
      emit({ type: "check-result", api, check: baselineTest });
    } finally {
      await writeFile(newSchemaFile, currentSchemaContent);
    }
    if (baselineBuild.status !== "passed" || baselineTest.status !== "passed") {
      emit({
        type: "step-finished",
        api,
        step: "baseline",
        durationMs: Date.now() - baselineStartedAt,
        status: "failed",
        reason: "baseline-failed",
      });
      const result: ServiceResult = {
        service,
        language: adapter.id,
        branch: "",
        steps: ["detect", "baseline"],
        changedFiles: [],
        checks: [baselineBuild, baselineTest],
        review: [
          {
            file: root,
            reason: "baseline build/test failed before any fix was attempted",
          },
        ],
        confidence: "unverified",
        costUsd: 0,
      };
      services.push(result);
      emit({ type: "service-completed", api, service: result });
      continue;
    }
    emit({
      type: "step-finished",
      api,
      step: "baseline",
      durationMs: Date.now() - baselineStartedAt,
      status: "passed",
    });

    if (isCancelled(options.abortController)) {
      stoppedReason = "cancelled";
      break;
    }

    if (!branchReady) {
      await ensureBranch(ctx);
      branchReady = true;
    }

    const regenerateStartedAt = Date.now();
    emit({ type: "step-started", api, step: "regenerate" });
    if (adapter.regenerateClient) {
      await adapter.regenerateClient(dockerCtx, apiEntry);
    }
    emit({
      type: "step-finished",
      api,
      step: "regenerate",
      durationMs: Date.now() - regenerateStartedAt,
      status: "passed",
    });

    const impactStartedAt = Date.now();
    emit({ type: "step-started", api, step: "impact" });
    const affected = await adapter.findAffected(dockerCtx, apiEntry, changes);
    emit({ type: "affected-found", api, affected });
    emit({
      type: "step-finished",
      api,
      step: "impact",
      durationMs: Date.now() - impactStartedAt,
      status: "passed",
    });

    if (affected.length === 0) {
      const verifyStartedAt = Date.now();
      emit({ type: "step-started", api, step: "verify" });
      const postBuild = await adapter.build(dockerCtx);
      emit({ type: "check-result", api, check: postBuild });
      const postTest = await adapter.test(dockerCtx);
      emit({ type: "check-result", api, check: postTest });
      const ok = postBuild.status === "passed" && postTest.status === "passed";
      emit({
        type: "step-finished",
        api,
        step: "verify",
        durationMs: Date.now() - verifyStartedAt,
        status: ok ? "passed" : "failed",
      });
      const review: ReviewItem[] = ok
        ? []
        : [
            {
              file: root,
              reason:
                "no affected locations were found, but build/tests failed after " +
                "regenerating the client",
            },
          ];

      const commitStartedAt = Date.now();
      emit({ type: "step-started", api, step: "commit" });
      const changedFiles = await commitAll(
        ctx,
        `schemend: update for ${apiConfig.name} change`,
      );
      emit({
        type: "step-finished",
        api,
        step: "commit",
        durationMs: Date.now() - commitStartedAt,
        status: "passed",
      });

      const result: ServiceResult = {
        service,
        language: adapter.id,
        branch: changedFiles.length > 0 ? BRANCH_NAME : "",
        steps: ["detect", "baseline", "regenerate", "impact"],
        changedFiles,
        checks: [postBuild, postTest],
        review,
        confidence: confidenceFrom(postBuild, postTest),
        costUsd: 0,
      };
      services.push(result);
      emit({ type: "service-completed", api, service: result });
      continue;
    }

    if (isCancelled(options.abortController)) {
      const commitStartedAt = Date.now();
      emit({ type: "step-started", api, step: "commit" });
      const changedFiles = await commitAll(
        ctx,
        `schemend: update for ${apiConfig.name} change`,
      );
      emit({
        type: "step-finished",
        api,
        step: "commit",
        durationMs: Date.now() - commitStartedAt,
        status: "passed",
      });

      const result: ServiceResult = {
        service,
        language: adapter.id,
        branch: changedFiles.length > 0 ? BRANCH_NAME : "",
        steps: ["detect", "baseline", "regenerate", "impact"],
        changedFiles,
        checks: [],
        review: [
          {
            file: root,
            reason: "cancelled before this api could be fixed",
          },
        ],
        confidence: "unverified",
        costUsd: 0,
      };
      services.push(result);
      emit({ type: "service-completed", api, service: result });
      stoppedReason = "cancelled";
      break;
    }

    try {
      budget.assertAvailable();
    } catch (error) {
      if (!(error instanceof BudgetExceededError)) throw error;

      const commitStartedAt = Date.now();
      emit({ type: "step-started", api, step: "commit" });
      const changedFiles = await commitAll(
        ctx,
        `schemend: update for ${apiConfig.name} change`,
      );
      emit({
        type: "step-finished",
        api,
        step: "commit",
        durationMs: Date.now() - commitStartedAt,
        status: "passed",
      });

      const result: ServiceResult = {
        service,
        language: adapter.id,
        branch: changedFiles.length > 0 ? BRANCH_NAME : "",
        steps: ["detect", "baseline", "regenerate", "impact"],
        changedFiles,
        checks: [],
        review: [
          {
            file: root,
            reason: "budget exhausted before this api could be fixed",
          },
        ],
        confidence: "unverified",
        costUsd: 0,
      };
      services.push(result);
      emit({ type: "service-completed", api, service: result });
      stoppedReason = "budget exceeded";
      break;
    }

    const fix = await runFixAgent({
      ctx: dockerCtx,
      adapter,
      apiEntry,
      affected,
      changes,
      budget,
      model: config.models.fix,
      api,
      ...(options.onEvent !== undefined ? { onEvent: options.onEvent } : {}),
      ...(options.abortController !== undefined
        ? { abortController: options.abortController }
        : {}),
    });

    const commitStartedAt = Date.now();
    emit({ type: "step-started", api, step: "commit" });
    const changedFiles = await commitAll(
      ctx,
      `schemend: update for ${apiConfig.name} change`,
    );
    emit({
      type: "step-finished",
      api,
      step: "commit",
      durationMs: Date.now() - commitStartedAt,
      status: "passed",
    });

    const result: ServiceResult = {
      service,
      language: adapter.id,
      branch: changedFiles.length > 0 ? BRANCH_NAME : "",
      steps: ["detect", "baseline", "regenerate", "impact", "fix", "verify"],
      changedFiles,
      checks: fix.checks,
      review: fix.review,
      confidence: fix.confidence,
      costUsd: fix.costUsd,
    };
    services.push(result);
    emit({ type: "service-completed", api, service: result });

    if (fix.review.some((item) => item.reason.includes("cancelled"))) {
      stoppedReason = "cancelled";
      break;
    }
    if (fix.review.some((item) => item.reason.includes("budget"))) {
      stoppedReason = "budget exceeded";
      break;
    }
  }

  const report: RunReport = {
    api: config.apis.map((apiConfig) => apiConfig.name).join(", "),
    startedAt,
    finishedAt: new Date().toISOString(),
    changes: allChanges,
    services,
    budgetUsd: config.budgetUsd,
    spentUsd: budget.spent,
    ...(stoppedReason !== undefined ? { stoppedReason } : {}),
  };
  emit({ type: "run-finished", report });
  return report;
}
