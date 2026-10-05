import {
	Boxes,
	CheckCircle2,
	CircleAlert,
	FileCode2,
	Gauge,
	GitBranch,
	GitPullRequest,
	type LucideIcon,
	Search,
} from "lucide-react";

export type Stat = {
	label: string;
	value: string;
	detail: string;
	icon: LucideIcon;
};

export const stats: Stat[] = [
	{
		label: "Tracked APIs",
		value: "12",
		detail: "3 internal · 9 external",
		icon: Boxes,
	},
	{
		label: "Pending changes",
		value: "3",
		detail: "21 breaking changes",
		icon: GitBranch,
	},
	{
		label: "PRs awaiting review",
		value: "7",
		detail: "Across 5 services",
		icon: GitPullRequest,
	},
	{
		label: "Auto-fix rate",
		value: "91.4%",
		detail: "Last 30 days",
		icon: Gauge,
	},
];

export type ActivityTone = "success" | "warning" | "primary";

export type ActivityItem = {
	icon: LucideIcon;
	title: string;
	meta: string;
	tone: ActivityTone;
};

export const activity: ActivityItem[] = [
	{
		icon: GitPullRequest,
		title: "Opened PR #184 in checkout-web",
		meta: "orders-service · 8 min ago",
		tone: "success",
	},
	{
		icon: CircleAlert,
		title: "Flagged ambiguous currency mapping",
		meta: "notification-service · 11 min ago",
		tone: "warning",
	},
	{
		icon: CheckCircle2,
		title: "48 tests passed",
		meta: "invoice-service · 12 min ago",
		tone: "success",
	},
	{
		icon: FileCode2,
		title: "Updated 4 Java source files",
		meta: "invoice-service · 14 min ago",
		tone: "primary",
	},
	{
		icon: Search,
		title: "Found 4 affected consumer services",
		meta: "orders-service · 18 min ago",
		tone: "primary",
	},
];
