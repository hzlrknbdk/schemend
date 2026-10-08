import { Button, Skeleton } from "@schemend/ui";
import { Download } from "lucide-react";
import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import { PageHeader } from "@/components/dashboard/page-header";
import { Section } from "@/components/dashboard/section";

const skeletonRows = ["row-1", "row-2", "row-3", "row-4", "row-5"] as const;

export function RunsPageSkeleton() {
	return (
		<DashboardShell>
			<PageHeader
				title="Runs history"
				description="Past schema and SDK migration runs across all repositories."
				action={
					<Button variant="outline" size="sm" disabled>
						<Download />
						Export CSV
					</Button>
				}
			/>
			<Section title="All runs">
				<div className="divide-y divide-border">
					{skeletonRows.map((row) => (
						<div key={row} className="flex items-center gap-4 px-5 py-4">
							<Skeleton className="h-4 w-24" />
							<Skeleton className="h-4 w-16" />
							<Skeleton className="h-4 w-28" />
							<Skeleton className="h-4 w-10" />
							<Skeleton className="h-4 flex-1" />
							<Skeleton className="h-4 w-16" />
							<Skeleton className="h-4 w-14" />
						</div>
					))}
				</div>
			</Section>
		</DashboardShell>
	);
}
