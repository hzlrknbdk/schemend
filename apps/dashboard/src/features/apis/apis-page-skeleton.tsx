import { Button, Skeleton } from "@schemend/ui";
import { Search, SlidersHorizontal } from "lucide-react";
import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import { PageHeader } from "@/components/dashboard/page-header";
import { Section } from "@/components/dashboard/section";
import { Input } from "@/components/ui/input";
import { kinds } from "@/features/apis/apis-page";

const skeletonRows = ["row-1", "row-2", "row-3", "row-4", "row-5"] as const;

export function ApisPageSkeleton() {
	return (
		<DashboardShell>
			<PageHeader
				title="API inventory"
				description="Every API discovered in connected repositories, internal and external."
				action={
					<Button variant="outline" size="sm" disabled>
						<SlidersHorizontal />
						Rescan sources
					</Button>
				}
			/>
			<div className="mb-5 flex items-center justify-between gap-4">
				<div className="relative w-80">
					<Search className="absolute left-3 top-2.5 size-4 text-muted-foreground" />
					<Input disabled placeholder="Search APIs..." className="pl-9" />
				</div>
				<div className="flex gap-2">
					{kinds.map((item) => (
						<Button key={item} size="sm" variant="outline" disabled>
							{item}
						</Button>
					))}
				</div>
			</div>
			<Section title="APIs" note="Discovered from source and evidence">
				<div className="divide-y divide-border">
					{skeletonRows.map((row) => (
						<div key={row} className="flex items-center gap-4 px-5 py-4">
							<Skeleton className="h-4 w-32" />
							<Skeleton className="h-4 w-16" />
							<Skeleton className="h-4 flex-1" />
							<Skeleton className="h-4 w-12" />
							<Skeleton className="h-4 w-20" />
							<Skeleton className="h-4 w-24" />
						</div>
					))}
				</div>
			</Section>
		</DashboardShell>
	);
}
