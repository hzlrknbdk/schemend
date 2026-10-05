import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowUpDown, Search, SlidersHorizontal } from "lucide-react";
import { useMemo, useState } from "react";
import {
	DashboardShell,
	PageHeader,
	Section,
	StatusBadge,
} from "@/components/schemend/dashboard-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { apis } from "@/data/schemend-data";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/demo/apis")({
	head: () => ({
		meta: [
			{ title: "API Inventory — Schemend" },
			{
				name: "description",
				content: "Discovered internal APIs and external SDK dependencies.",
			},
			{ property: "og:title", content: "API Inventory — Schemend" },
			{
				property: "og:description",
				content: "Discovered internal APIs and external SDK dependencies.",
			},
			{ property: "og:type", content: "website" },
			{ name: "twitter:card", content: "summary_large_image" },
		],
	}),
	component: ApiInventory,
});
const types = ["All types", "Internal REST", "External SDK", "GraphQL"];
const statuses = ["All statuses", "Up to date", "Update available"];
function ApiInventory() {
	const [query, setQuery] = useState("");
	const [type, setType] = useState("All types");
	const [status, setStatus] = useState("All statuses");
	const filtered = useMemo(
		() =>
			apis.filter(
				(api) =>
					(type === "All types" || api.type === type) &&
					(status === "All statuses" || api.status === status) &&
					api.name.toLowerCase().includes(query.toLowerCase()),
			),
		[query, type, status],
	);
	return (
		<DashboardShell>
			<PageHeader
				title="API inventory"
				description="Discovered schemas and SDK dependencies across connected repositories."
				action={
					<Button variant="outline" size="sm">
						<SlidersHorizontal />
						Rescan sources
					</Button>
				}
			/>
			<div className="mb-4 flex items-center justify-between gap-4">
				<div className="relative w-80">
					<Search className="absolute left-3 top-2.5 size-4 text-muted-foreground" />
					<Input
						value={query}
						onChange={(e) => setQuery(e.target.value)}
						placeholder="Search APIs..."
						className="pl-9"
					/>
				</div>
				<div className="flex gap-2">
					{types.map((item) => (
						<Button
							key={item}
							size="sm"
							variant={type === item ? "default" : "outline"}
							onClick={() => setType(item)}
						>
							{item}
						</Button>
					))}
				</div>
			</div>
			<div className="mb-5 flex gap-2">
				{statuses.map((item) => (
					<button
						key={item}
						type="button"
						onClick={() => setStatus(item)}
						className={cn(
							"rounded-full border border-border bg-card px-3 py-1 text-xs text-muted-foreground",
							status === item && "border-primary bg-primary-soft text-primary",
						)}
					>
						{item}
					</button>
				))}
			</div>
			<Section
				title={`${filtered.length} APIs`}
				note="Versions checked against the latest available source"
			>
				<div className="overflow-x-auto">
					<table className="w-full min-w-[1000px] text-left">
						<thead>
							<tr className="border-b border-border bg-muted/50 text-[11px] uppercase text-muted-foreground">
								{[
									"API name",
									"Type",
									"Owner service",
									"Current / latest",
									"Consumers",
									"Schema source",
									"Status",
								].map((head) => (
									<th key={head} className="px-5 py-3 font-medium">
										{head}
										{head === "API name" && (
											<ArrowUpDown className="ml-1 inline size-3" />
										)}
									</th>
								))}
							</tr>
						</thead>
						<tbody>
							{filtered.map((api) => (
								<tr
									key={api.name}
									className="border-b border-border last:border-0 hover:bg-muted/40"
								>
									<td className="px-5 py-4">
										<Link
											to={
												api.name === "orders-service"
													? "/demo/impact"
													: "/demo/runs"
											}
											className="text-sm font-medium hover:text-primary"
										>
											{api.name}
										</Link>
									</td>
									<td className="px-5 py-4">
										<span className="rounded border border-border bg-muted px-2 py-1 text-xs">
											{api.type}
										</span>
									</td>
									<td className="px-5 py-4 text-xs text-muted-foreground">
										{api.owner}
									</td>
									<td className="px-5 py-4 font-mono text-xs">
										<span>{api.current}</span>
										<span className="mx-2 text-muted-foreground">→</span>
										<span
											className={
												api.status === "Update available"
													? "text-warning"
													: "text-muted-foreground"
											}
										>
											{api.latest}
										</span>
									</td>
									<td className="px-5 py-4 font-mono text-xs">
										{api.consumers}
									</td>
									<td className="px-5 py-4 font-mono text-xs text-muted-foreground">
										{api.source}
									</td>
									<td className="px-5 py-4">
										<StatusBadge status={api.status} />
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
