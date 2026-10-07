import { Button, StatusBadge } from "@schemend/ui";
import { Link } from "@tanstack/react-router";
import { ChevronRight, Download } from "lucide-react";
import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import { PageHeader } from "@/components/dashboard/page-header";
import { Section } from "@/components/dashboard/section";
import { formatCost, formatDateTime, formatDuration } from "@/lib/format";
import {
	runId,
	runStatus,
	runStatusTone,
	triggerLabel,
} from "@/lib/run-status";
import type { RunReport } from "@/repository";

export interface RunsPageProps {
	runs: RunReport[];
}

export function RunsPage({ runs: unsortedRuns }: RunsPageProps) {
	const runs = [...unsortedRuns].sort((a, b) =>
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
									key={runId(run)}
									className="border-b border-border last:border-0 hover:bg-muted/40"
								>
									<td className="px-5 py-4 font-mono text-xs text-muted-foreground">
										{formatDateTime(run.startedAt)}
									</td>
									<td className="px-5 py-4 text-xs">
										{triggerLabel(run.trigger)}
									</td>
									<td className="px-5 py-4 text-sm font-medium">{run.api}</td>
									<td className="px-5 py-4 font-mono text-xs">
										{run.services.length}
									</td>
									<td className="px-5 py-4">
										<StatusBadge
											tone={runStatusTone[runStatus(run)]}
											label={runStatus(run)}
										/>
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
											search={{ run: runId(run) }}
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
