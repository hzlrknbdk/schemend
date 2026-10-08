import { Card, Skeleton, StatusDot } from "@schemend/ui";
import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import { PageHeader } from "@/components/dashboard/page-header";
import { Section } from "@/components/dashboard/section";

const statLabels = [
	"Tracked APIs",
	"Needs review",
	"PRs opened",
	"Auto-fix rate",
] as const;
const skeletonRows = ["row-1", "row-2", "row-3"] as const;

export function OverviewPageSkeleton() {
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
				{statLabels.map((label) => (
					<Card key={label} className="p-5">
						<span className="text-xs font-medium uppercase text-muted-foreground">
							{label}
						</span>
						<Skeleton className="mt-4 h-8 w-16" />
						<Skeleton className="mt-2 h-3 w-24" />
					</Card>
				))}
			</div>
			<div className="mt-6 grid grid-cols-[minmax(0,1.65fr)_minmax(300px,0.8fr)] gap-6">
				<Section
					title="Recent runs"
					note="Most recent schema and SDK migration runs"
				>
					<div className="divide-y divide-border">
						{skeletonRows.map((row) => (
							<div key={row} className="flex items-center gap-4 px-5 py-4">
								<Skeleton className="h-4 flex-1" />
								<Skeleton className="h-4 w-10" />
								<Skeleton className="h-4 w-10" />
								<Skeleton className="h-4 w-20" />
							</div>
						))}
					</div>
				</Section>
				<Section title="Agent activity" note="Latest service outcomes">
					<div className="space-y-4 px-5 py-4">
						{skeletonRows.map((row) => (
							<div key={row} className="flex items-center gap-3">
								<Skeleton className="size-8 shrink-0 rounded-full" />
								<Skeleton className="h-4 flex-1" />
							</div>
						))}
					</div>
				</Section>
			</div>
		</DashboardShell>
	);
}
