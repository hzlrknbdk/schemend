import { Card, Skeleton } from "@schemend/ui";
import { Server } from "lucide-react";
import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import { PageHeader } from "@/components/dashboard/page-header";
import { Section } from "@/components/dashboard/section";

const servicePlaceholders = ["service-1", "service-2"] as const;

export function ImpactPageSkeleton() {
	return (
		<DashboardShell>
			<PageHeader
				eyebrow="Change impact"
				title="Loading change impact"
				description="Impact analysis for the most recent schema change."
			/>
			<Section title="Schema changes">
				<div className="space-y-2 p-5">
					<Skeleton className="h-4 w-full" />
					<Skeleton className="h-4 w-5/6" />
					<Skeleton className="h-4 w-2/3" />
				</div>
			</Section>
			<Section
				className="mt-6"
				title="Impact map"
				note="Source API and every affected consumer"
			>
				<div className="grid grid-cols-[250px_1fr] items-center gap-16 px-7 py-8">
					<Card className="p-5">
						<div className="flex items-center gap-3">
							<span className="flex size-9 items-center justify-center rounded-md bg-muted">
								<Server className="size-4 text-muted-foreground" />
							</span>
							<Skeleton className="h-4 w-24" />
						</div>
					</Card>
					<div className="grid grid-cols-2 gap-4">
						{servicePlaceholders.map((service) => (
							<Card key={service} className="p-4">
								<Skeleton className="h-4 w-24" />
								<Skeleton className="mt-5 h-3 w-full" />
							</Card>
						))}
					</div>
				</div>
			</Section>
		</DashboardShell>
	);
}
