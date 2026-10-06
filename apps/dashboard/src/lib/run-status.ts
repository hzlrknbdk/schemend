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

export function breakingChangeCount(run: RunReport): number {
	return run.changes.filter((change) => change.severity === "breaking").length;
}
