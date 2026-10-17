import type { RunCheckOptions } from "./check.js";
import { runCheck } from "./check.js";
import type { CheckEvent } from "./events.js";
import { createEventEmitter } from "./events.js";
import type { PlatformAdapter } from "./platform-adapter.js";
import type { ApiServiceResult } from "./pr-body.js";
import { buildPrBody } from "./pr-body.js";
import type { RunReport } from "./types.js";

export interface RunRunOptions extends RunCheckOptions {
  platform: PlatformAdapter;
}

/** Thrown when pushBranch succeeded but getDefaultBranch/openChangeRequest didn't - the branch itself is already on the remote, only the PR/MR step failed. */
export class ChangeRequestFailedAfterPushError extends Error {
  constructor(branch: string, cause: unknown) {
    const reason = cause instanceof Error ? cause.message : String(cause);
    super(
      `pushed branch "${branch}" but failed to open/update the pull/merge request: ${reason}. ` +
        `The branch is already on the remote - re-running "schemend run" will try to open the ` +
        `request again without re-doing the fix.`,
      { cause: cause instanceof Error ? cause : undefined },
    );
    this.name = "ChangeRequestFailedAfterPushError";
  }
}

/**
 * Whether this run is complete enough to push. `report.stoppedReason` set (cancelled/budget
 * exceeded mid-run) or any `ServiceResult` carrying an orchestrator-generated review item
 * (baseline-failed/schema-read-failed/docker-unavailable/cancelled/budget-exceeded) means at
 * least one api in this consumer didn't finish; an agent-flag item is a normal, successful
 * outcome and never counts. v1 pushes nothing in that case rather than open a PR with some apis
 * fixed and others silently missing - see DECISIONS.md.
 */
function isIncomplete(report: RunReport): boolean {
  if (report.stoppedReason !== undefined) return true;
  return report.services.some((service) =>
    service.review.some((item) => item.source !== "agent-flag"),
  );
}

/**
 * `schemend run` (SPEC §9): everything `schemend check` does, then pushes the shared branch and
 * opens/updates exactly one PR/MR for the whole consumer (SPEC §2 step 7) - never per api, even
 * when `config.apis` has more than one entry (DECISIONS.md 2026-10-05). No change, or an
 * incomplete run, pushes nothing and exits normally (not an error).
 */
export async function runRun(options: RunRunOptions): Promise<RunReport> {
  const { platform, root, exec } = options;
  const emit = createEventEmitter(options.onEvent);
  const serviceByApi: ApiServiceResult[] = [];

  // runCheck's own service-completed events are the only place api and ServiceResult arrive
  // together - captured here instead of added as a field on ServiceResult itself (see
  // DECISIONS.md). Its own run-finished fires before push/PR have even started; swallowed here
  // so runRun can emit its own at the end, carrying the ChangeRequest attached below.
  const forwardEvent = (event: CheckEvent): void => {
    if (event.type === "service-completed") {
      serviceByApi.push({ api: event.api, service: event.service });
    }
    if (event.type === "run-finished") return;
    options.onEvent?.(event);
  };

  const report = await runCheck({ ...options, onEvent: forwardEvent });

  const pushableServices = report.services.filter(
    (service) => service.branch !== "",
  );
  const [firstPushable] = pushableServices;
  if (!firstPushable || isIncomplete(report)) {
    emit({ type: "run-finished", report });
    return report;
  }
  const branch = firstPushable.branch;
  const apiResults = serviceByApi.filter(
    ({ service }) => service.branch !== "",
  );

  const pushStartedAt = Date.now();
  // Labeled with report.api (the joined api list, e.g. "orders, inventory"), not one api's name
  // - this step is about the one shared branch/PR for the whole consumer, not any single api.
  emit({ type: "step-started", api: report.api, step: "push" });
  try {
    await platform.pushBranch(root, branch, exec);
  } catch (error) {
    emit({
      type: "step-finished",
      api: report.api,
      step: "push",
      durationMs: Date.now() - pushStartedAt,
      status: "failed",
      reason: "push-failed",
    });
    throw error;
  }

  let finalReport: RunReport;
  try {
    const baseBranch = await platform.getDefaultBranch();
    const { title, body } = buildPrBody(
      report.api,
      report.changes,
      apiResults,
      platform.maxBodyLength,
    );
    const changeRequest = await platform.openChangeRequest({
      branch,
      baseBranch,
      title,
      body,
    });
    finalReport = {
      ...report,
      services: report.services.map((service) =>
        service.branch === branch ? { ...service, changeRequest } : service,
      ),
    };
  } catch (error) {
    emit({
      type: "step-finished",
      api: report.api,
      step: "push",
      durationMs: Date.now() - pushStartedAt,
      status: "failed",
      reason: "push-failed",
    });
    throw new ChangeRequestFailedAfterPushError(branch, error);
  }

  emit({
    type: "step-finished",
    api: report.api,
    step: "push",
    durationMs: Date.now() - pushStartedAt,
    status: "passed",
  });
  emit({ type: "run-finished", report: finalReport });
  return finalReport;
}
