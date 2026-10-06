import { createFileRoute, Link } from "@tanstack/react-router";
import { ChevronRight, Download } from "lucide-react";
import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import { PageHeader } from "@/components/dashboard/page-header";
import { Section } from "@/components/dashboard/section";
import { StatusBadge } from "@/components/dashboard/status-badge";
import { Button } from "@/components/ui/button";
import { formatCost, formatDateTime, formatDuration } from "@/lib/format";
import { runStatus } from "@/lib/run-status";

export const Route = createFileRoute("/runs")({
	head: () => ({
		meta: [
			{ title: "Runs History — Schemend" },
			{
				name: "description",
				content: "Past API migration runs, outcomes, duration, and cost.",
			},
		],
	}),
	loader: ({ context }) => context.repository.listRuns(),
	component: Runs,
});

function Runs() {
	const runs = [...Route.useLoaderData()].sort((a, b) =>
		b.startedAt.localeCompare(a.startedAt),
	);

	return (
		<DashboardShell>
			<PageHeader
				title="Runs history"
				description="Past schema and SDK migration runs across all repositories."
				action={
					<Button variant="outline" size="sm">
						<Download />
						Export CSV
					</Button>
				}
			/>
			<Section title="All runs" note={`${runs.length} runs recorded`}>
				<div className="overflow-x-auto">
					<table className="w-full min-w-[900px] text-left">
						<thead>
							<tr className="border-b border-border bg-muted/50 text-2xs uppercase text-muted-foreground">
								{[
									"Date",
									"Trigger",
									"API",
									"Services",
									"Result",
									"Duration",
									"Cost",
									"",
								].map((head) => (
									<th className="px-5 py-3 font-medium" key={head}>
										{head}
									</th>
								))}
							</tr>
						</thead>
						<tbody>
							{runs.map((run) => (
								<tr
									key={`${run.api}-${run.startedAt}`}
									className="border-b border-border last:border-0 hover:bg-muted/40"
								>
									<td className="px-5 py-4 font-mono text-xs text-muted-foreground">
										{formatDateTime(run.startedAt)}
									</td>
									<td className="px-5 py-4 text-xs">
										{run.trigger?.type === "schema-change"
											? "Schema change"
											: run.trigger?.type === "package-release"
												? "SDK release"
												: "—"}
									</td>
									<td className="px-5 py-4 text-sm font-medium">{run.api}</td>
									<td className="px-5 py-4 font-mono text-xs">
										{run.services.length}
									</td>
									<td className="px-5 py-4">
										<StatusBadge status={runStatus(run)} />
									</td>
									<td className="px-5 py-4 font-mono text-xs text-muted-foreground">
										{formatDuration(run.startedAt, run.finishedAt)}
									</td>
									<td className="px-5 py-4 font-mono text-xs">
										{formatCost(run.spentUsd)}
									</td>
									<td className="px-5 py-4">
										<Link
											to={
												run.api === "orders-service" ? "/impact" : "/migration"
											}
											aria-label={`View ${run.api} run`}
											className="text-muted-foreground hover:text-primary"
										>
											<ChevronRight className="size-4" />
										</Link>
									</td>
								</tr>
							))}
						</tbody>
					</table>
				</div>
			</Section>
		</DashboardShell>
	);
}
