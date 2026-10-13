import { rm } from "node:fs/promises";
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
} from "./docker-exec.js";
import type { CheckEvent } from "./events.js";
import { createEventEmitter, EVENT_SCHEMA_VERSION } from "./events.js";
import { writeFileAtRef } from "./git.js";
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

async function pickAdapter(
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
 * adapter's image and dependency volume exist (installing with network access into a volume
 * keyed by the lockfile's content, so a dependency change lands on a fresh volume instead of
 * stale node_modules - see docker-exec.ts), prunes any older volume for this same root, then
 * returns a context whose exec runs with that volume mounted and the network disabled.
 */
async function ensureDockerCtx(
  adapter: LanguageAdapter,
  root: string,
  exec: Exec,
  abortController: AbortController | undefined,
  containerUser: ContainerUser | undefined,
): Promise<AdapterContext> {
  await assertStandaloneProject(
    root,
    adapter.lockfile,
    adapter.workspaceMarkers,
  );
  if (adapter.assertSupportedLayout) {
    await adapter.assertSupportedLayout(root);
  }
  const volume = await dependencyVolumeName(
    root,
    path.join(root, adapter.lockfile),
  );
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
  await ensureContainerDeps({
    exec,
    root,
    image: adapter.dockerImage,
    volume,
    volumeTarget: adapter.dependencyVolumePath,
    installCommand: adapter.installCommand,
    ...(abortController !== undefined ? { abortController } : {}),
    ...(containerUser !== undefined ? { user: containerUser } : {}),
  });
  return {
    root,
    exec: createDockerExec(exec, root, adapter.dockerImage, {
      network: "none",
      volumes: { [volume]: adapter.dependencyVolumePath },
      ...(abortController !== undefined ? { abortController } : {}),
      ...(containerUser !== undefined ? { user: containerUser } : {}),
    }),
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
    if (!dockerCtxCache) {
      dockerCtxCache = await ensureDockerCtx(
        adapter,
        root,
        exec,
        options.abortController,
        options.containerUser,
      );
    }
    const dockerCtx: AdapterContext = dockerCtxCache;
    const baselineBuild = await adapter.build(dockerCtx);
    emit({ type: "check-result", api, check: baselineBuild });
    const baselineTest = await adapter.test(dockerCtx);
    emit({ type: "check-result", api, check: baselineTest });
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
      await adapter.regenerateClient(ctx, apiEntry);
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
    const affected = await adapter.findAffected(ctx, apiEntry, changes);
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
