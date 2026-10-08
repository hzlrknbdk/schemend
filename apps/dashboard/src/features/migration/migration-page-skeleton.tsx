import { Card, Skeleton } from "@schemend/ui";
import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import { PageHeader } from "@/components/dashboard/page-header";
import { Section } from "@/components/dashboard/section";

const stepPlaceholders = ["step-1", "step-2", "step-3"] as const;
const checkPlaceholders = ["check-1", "check-2", "check-3"] as const;

export function MigrationPageSkeleton() {
	return (
		<DashboardShell>
			<PageHeader
				eyebrow="Migration detail"
				title="Loading migration"
				description="Review a generated migration and its verification results."
			/>
			<Card className="mb-6 flex items-center gap-3 px-5 py-3">
				<Skeleton className="h-4 w-16" />
				<Skeleton className="h-4 w-40" />
			</Card>
			<div className="grid grid-cols-[minmax(0,1fr)_320px] gap-6">
				<div className="space-y-6">
					<Section title="Steps taken" note="In order">
						<div className="flex divide-x divide-border">
							{stepPlaceholders.map((step) => (
								<div key={step} className="min-w-[140px] flex-1 p-4">
									<Skeleton className="size-6 rounded-full" />
									<Skeleton className="mt-3 h-3 w-20" />
								</div>
							))}
						</div>
					</Section>
				</div>
				<div className="space-y-6">
					<Section title="Verification">
						<div className="space-y-3 p-4">
							{checkPlaceholders.map((check) => (
								<Skeleton key={check} className="h-4 w-full" />
							))}
						</div>
					</Section>
				</div>
			</div>
		</DashboardShell>
	);
}
