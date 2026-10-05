import { createFileRoute, Link } from "@tanstack/react-router";
import {
	ArrowRight,
	Boxes,
	CheckCircle2,
	CircleAlert,
	FileCode2,
	Gauge,
	GitBranch,
	GitPullRequest,
	Search,
} from "lucide-react";
import {
	DashboardShell,
	PageHeader,
	Section,
	StatusBadge,
} from "@/components/schemend/dashboard-shell";
import { changes } from "@/lib/schemend-data";

export const Route = createFileRoute("/demo/")({
	head: () => ({
		meta: [
			{ title: "Overview — Schemend" },
			{
				name: "description",
				content: "Monitor API changes and migration pull requests.",
			},
			{ property: "og:title", content: "Overview — Schemend" },
			{
				property: "og:description",
				content: "Monitor API changes and migration pull requests.",
			},
			{ property: "og:type", content: "website" },
			{ name: "twitter:card", content: "summary_large_image" },
		],
	}),
	component: Overview,
});

const stats = [
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
const activity = [
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

function Overview() {
	return (
		<DashboardShell>
			<PageHeader
				title="Overview"
				description="API compatibility across your services, updated a few seconds ago."
				action={
					<div className="flex items-center gap-2 rounded-md border border-border bg-card px-3 py-2 text-xs text-muted-foreground">
						<span className="size-2 rounded-full bg-success" />
						Agent is monitoring
					</div>
				}
			/>
			<div className="grid grid-cols-4 gap-4">
				{stats.map((stat) => (
					<div
						key={stat.label}
						className="rounded-lg border border-border bg-card p-5"
					>
						<div className="flex items-center justify-between text-muted-foreground">
							<span className="text-xs font-medium uppercase">
								{stat.label}
							</span>
							<stat.icon className="size-4" />
						</div>
						<p className="mt-4 text-3xl font-semibold">{stat.value}</p>
						<p className="mt-1 text-xs text-muted-foreground">{stat.detail}</p>
					</div>
				))}
			</div>
			<div className="mt-6 grid grid-cols-[minmax(0,1.65fr)_minmax(300px,0.8fr)] gap-6">
				<Section
					title="Recent API changes"
					note="Breaking changes detected across connected sources"
					action={
						<Link
							to="/demo/apis"
							className="flex items-center gap-1 text-xs font-medium text-primary"
						>
							View inventory <ArrowRight className="size-3" />
						</Link>
					}
				>
					<div className="divide-y divide-border">
						{changes.map((change) => (
							<Link
								key={change.api}
								to={
									change.api === "orders-service"
										? "/demo/impact"
										: "/demo/runs"
								}
								className="grid grid-cols-[minmax(0,1fr)_88px_88px_120px] items-center gap-4 px-5 py-4 transition-colors hover:bg-muted/50"
							>
								<div>
									<p className="text-sm font-medium">{change.api}</p>
									<p className="mt-1 truncate text-xs text-muted-foreground">
										{change.summary}
									</p>
								</div>
								<div>
									<p className="font-mono text-sm">{change.breaking}</p>
									<p className="text-[11px] text-muted-foreground">breaking</p>
								</div>
								<div>
									<p className="font-mono text-sm">{change.services}</p>
									<p className="text-[11px] text-muted-foreground">services</p>
								</div>
								<div className="flex flex-col items-end gap-1.5">
									<StatusBadge status={change.status} />
									<span className="text-[10px] text-muted-foreground">
										{change.time}
									</span>
								</div>
							</Link>
						))}
					</div>
				</Section>
				<Section title="Agent activity" note="Live run events">
					<div className="px-5 py-2">
						{activity.map((item, index) => (
							<div key={item.title} className="relative flex gap-3 py-3.5">
								{index < activity.length - 1 && (
									<span className="absolute left-[15px] top-10 h-7 w-px bg-border" />
								)}
								<span
									className={`z-10 flex size-8 shrink-0 items-center justify-center rounded-full bg-${item.tone}-soft text-${item.tone}`}
								>
									<item.icon className="size-3.5" />
								</span>
								<div>
									<p className="text-xs font-medium leading-5">{item.title}</p>
									<p className="text-[11px] text-muted-foreground">
										{item.meta}
									</p>
								</div>
							</div>
						))}
					</div>
				</Section>
			</div>
		</DashboardShell>
	);
}
