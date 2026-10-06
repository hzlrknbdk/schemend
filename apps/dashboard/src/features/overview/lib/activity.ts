import {
	CheckCircle2,
	CircleAlert,
	FileCode2,
	GitPullRequest,
	type LucideIcon,
} from "lucide-react";
import type { ServiceResult } from "@/repository";

export type ActivityTone = "success" | "warning" | "primary";

export interface ActivityEvent {
	icon: LucideIcon;
	title: string;
	tone: ActivityTone;
}

/** One headline event per service outcome, derived from real ServiceResult fields only. */
export function activityEvent(service: ServiceResult): ActivityEvent {
	if (service.review.length > 0) {
		return {
			icon: CircleAlert,
			title: `Flagged ${service.review.length} item${service.review.length > 1 ? "s" : ""} for review in ${service.service}`,
			tone: "warning",
		};
	}
	if (service.changeRequest) {
		return {
			icon: GitPullRequest,
			title: `Opened a pull request for ${service.service}`,
			tone: "success",
		};
	}
	const passed = service.checks.filter(
		(check) => check.status === "passed",
	).length;
	if (passed > 0) {
		return {
			icon: CheckCircle2,
			title: `${passed} check${passed > 1 ? "s" : ""} passed in ${service.service}`,
			tone: "success",
		};
	}
	return {
		icon: FileCode2,
		title: `Updated ${service.changedFiles.length} file${service.changedFiles.length === 1 ? "" : "s"} in ${service.service}`,
		tone: "primary",
	};
}
