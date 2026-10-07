import { Card, cn, StatusBadge, StatusDot } from "@schemend/ui";
import { Link } from "@tanstack/react-router";
import {
	ArrowRight,
	Boxes,
	Gauge,
	GitBranch,
	GitPullRequest,
} from "lucide-react";
import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import { PageHeader } from "@/components/dashboard/page-header";
import { Section } from "@/components/dashboard/section";
import { formatDateTime } from "@/lib/format";
import {
	breakingChangeCount,
	runStatus,
	runStatusTone,
} from "@/lib/run-status";
import type { RunReport } from "@/repository";
import { type ActivityTone, activityEvent } from "./lib/activity";

export interface OverviewPageProps {
	runs: RunReport[];
}

const activityToneClasses: Record<ActivityTone, string> = {
	success: "bg-success-soft text-success",
	warning: "bg-warning-soft text-warning",
	primary: "bg-primary-soft text-primary",
};

export function OverviewPage({ runs }: OverviewPageProps) {
	const services = runs.flatMap((run) => run.services);
	const trackedApis = new Set(runs.map((run) => run.api)).size;
	const needsReview = runs.filter(
		(run) => runStatus(run) === "Needs review",
	).length;
	const prsOpened = services.filter((service) => service.changeRequest).length;
	const verified = services.filter(
		(service) => service.confidence !== "unverified",
	).length;
	const autoFixRate =
		services.length > 0 ? Math.round((verified / services.length) * 100) : 0;

	const stats = [
		{
			label: "Tracked APIs",
			value: String(trackedApis),
			detail: `${runs.length} runs recorded`,
			icon: Boxes,
		},
		{
			label: "Needs review",
			value: String(needsReview),
			detail: "runs with open review items",
			icon: GitBranch,
		},
		{
			label: "PRs opened",
			value: String(prsOpened),
			detail: `across ${services.length} services`,
			icon: GitPullRequest,
		},
		{
			label: "Auto-fix rate",
			value: `${autoFixRate}%`,
			detail: "verified by build or tests",
			icon: Gauge,
		},
	];

	const recentRuns = [...runs]
		.sort((a, b) => b.startedAt.localeCompare(a.startedAt))
		.slice(0, 5);

	const activity = recentRuns
		.flatMap((run) => run.services.map((service) => ({ run, service })))
		.slice(0, 5);

	return (
		<DashboardShell>
			<PageHeader
				title="Overview"
				description="API compatibility across your services, derived from the latest runs."
				action={
					<div className="flex items-center gap-2 rounded-md border border-border bg-card px-3 py-2 text-xs text-muted-foreground">
						<StatusDot tone="success" label="Agent is monitoring" />
						<span aria-hidden="true">Agent is monitoring</span>
					</div>
				}
			/>
			<div className="grid grid-cols-4 gap-4">
				{stats.map((stat) => (
					<Card key={stat.label} className="p-5">
						<div className="flex items-center justify-between text-muted-foreground">
							<span className="text-xs font-medium uppercase">
								{stat.label}
							</span>
							<stat.icon className="size-4" />
						</div>
						<p className="mt-4 text-3xl font-semibold">{stat.value}</p>
						<p className="mt-1 text-xs text-muted-foreground">{stat.detail}</p>
					</Card>
				))}
			</div>
			<div className="mt-6 grid grid-cols-[minmax(0,1.65fr)_minmax(300px,0.8fr)] gap-6">
				<Section
					title="Recent runs"
					note="Most recent schema and SDK migration runs"
					action={
						<Link
							to="/runs"
							className="flex items-center gap-1 text-xs font-medium text-primary"
						>
							View all runs <ArrowRight className="size-3" />
						</Link>
					}
				>
					<div className="divide-y divide-border">
						{recentRuns.map((run) => (
							<Link
								key={`${run.api}-${run.startedAt}`}
								to={run.api === "orders-service" ? "/impact" : "/runs"}
								className="grid grid-cols-[minmax(0,1fr)_88px_88px_120px] items-center gap-4 px-5 py-4 transition-colors hover:bg-muted/50"
							>
								<div>
									<p className="text-sm font-medium">{run.api}</p>
									<p className="mt-1 truncate text-xs text-muted-foreground">
										{run.changes[0]?.summary ??
											`${run.services.length} service${run.services.length === 1 ? "" : "s"} checked`}
									</p>
								</div>
								<div>
									<p className="font-mono text-sm">
										{breakingChangeCount(run)}
									</p>
									<p className="text-2xs text-muted-foreground">breaking</p>
								</div>
								<div>
									<p className="font-mono text-sm">{run.services.length}</p>
									<p className="text-2xs text-muted-foreground">services</p>
								</div>
								<div className="flex flex-col items-end gap-1.5">
									<StatusBadge
										tone={runStatusTone[runStatus(run)]}
										label={runStatus(run)}
									/>
									<span className="text-2xs text-muted-foreground">
										{formatDateTime(run.startedAt)}
									</span>
								</div>
							</Link>
						))}
					</div>
				</Section>
				<Section title="Agent activity" note="Latest service outcomes">
					<div className="px-5 py-2">
						{activity.map(({ run, service }, index) => {
							const event = activityEvent(service);
							return (
								<div
									key={`${run.api}-${service.service}`}
									className="relative flex gap-3 py-3.5"
								>
									{index < activity.length - 1 && (
										<span className="absolute left-[15px] top-10 h-7 w-px bg-border" />
									)}
									<span
										className={cn(
											"z-10 flex size-8 shrink-0 items-center justify-center rounded-full",
											activityToneClasses[event.tone],
										)}
									>
										<event.icon className="size-3.5" />
									</span>
									<div>
										<p className="text-xs font-medium leading-5">
											{event.title}
										</p>
										<p className="text-2xs text-muted-foreground">
											{run.api} · {formatDateTime(run.startedAt)}
										</p>
									</div>
								</div>
							);
						})}
					</div>
				</Section>
			</div>
		</DashboardShell>
	);
}
