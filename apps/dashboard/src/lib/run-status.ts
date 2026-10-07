import type { Tone } from "@schemend/ui";
import type { RunReport } from "@/repository";

export type RunStatus = "Needs review" | "PRs opened" | "Fixed" | "Stopped";

/** Derived only from what a RunReport actually carries — no merge state, nothing we don't track. */
export function runStatus(run: RunReport): RunStatus {
	if (run.stoppedReason) return "Stopped";
	if (run.services.some((service) => service.review.length > 0))
		return "Needs review";
	if (run.services.some((service) => service.changeRequest))
		return "PRs opened";
	return "Fixed";
}

export const runStatusTone: Record<RunStatus, Tone> = {
	Fixed: "success",
	"PRs opened": "success",
	"Needs review": "warning",
	Stopped: "warning",
};

/** `@schemend/core` has no run id field; api+startedAt is the stable, already-unique pair every list here keys by. */
export function runId(run: RunReport): string {
	return `${run.api}-${run.startedAt}`;
}

export function breakingChangeCount(run: RunReport): number {
	return run.changes.filter((change) => change.severity === "breaking").length;
}

/** `run.trigger` is only absent for runs recorded before RunTrigger existed. */
export function triggerLabel(trigger: RunReport["trigger"]): string {
	if (!trigger) return "—";
	switch (trigger.type) {
		case "schema-change":
			return "Schema change";
		case "package-release":
			return "SDK release";
		default:
			return trigger.type satisfies never;
	}
}
