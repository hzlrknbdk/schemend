import { createFileRoute } from "@tanstack/react-router";
import { ArrowUpDown, Search, SlidersHorizontal } from "lucide-react";
import { useMemo, useState } from "react";
import {
	DashboardShell,
	PageHeader,
	Section,
	StatusBadge,
} from "@/components/dashboard/dashboard-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatDateTime } from "@/lib/format";
import { breakingChangeCount, runStatus } from "@/lib/run-status";
import { cn } from "@/lib/utils";
import type { ApiEntry } from "@/repository";

export const Route = createFileRoute("/apis")({
	head: () => ({
		meta: [
			{ title: "API Inventory — Schemend" },
			{
				name: "description",
				content: "Discovered internal APIs and external SDK dependencies.",
			},
		],
	}),
	loader: async ({ context }) => {
		const [apis, runs] = await Promise.all([
			context.repository.listApis(),
			context.repository.listRuns(),
		]);
		return { apis, runs };
	},
	component: ApiInventory,
});

const kinds = ["All kinds", "internal", "external"] as const;

function formatSource(source: ApiEntry["source"]): string {
	return source.type === "openapi"
		? source.location
		: `${source.ecosystem} · ${source.name}@${source.version}`;
}

function ApiInventory() {
	const { apis, runs } = Route.useLoaderData();
	const [query, setQuery] = useState("");
	const [kind, setKind] = useState<string>("All kinds");

	const rows = useMemo(
		() =>
			apis.map((api) => {
				const apiRuns = [...runs]
					.filter((run) => run.api === api.name)
					.sort((a, b) => b.startedAt.localeCompare(a.startedAt));
				const lastRun = apiRuns[0];
				const consumers = new Set(
					apiRuns.flatMap((run) =>
						run.services.map((service) => service.service),
					),
				).size;
				return { api, lastRun, consumers };
			}),
		[apis, runs],
	);

	const filtered = rows.filter(
		(row) =>
			(kind === "All kinds" || row.api.kind === kind) &&
			row.api.name.toLowerCase().includes(query.toLowerCase()),
	);

	return (
		<DashboardShell>
			<PageHeader
				title="API inventory"
				description="Every API discovered in connected repositories, internal and external."
				action={
					<Button variant="outline" size="sm">
						<SlidersHorizontal />
						Rescan sources
					</Button>
				}
			/>
			<div className="mb-5 flex items-center justify-between gap-4">
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
					{kinds.map((item) => (
						<Button
							key={item}
							size="sm"
							variant={kind === item ? "default" : "outline"}
							onClick={() => setKind(item)}
						>
							{item}
						</Button>
					))}
				</div>
			</div>
			<Section
				title={`${filtered.length} APIs`}
				note="Discovered from source and evidence"
			>
				<div className="overflow-x-auto">
					<table className="w-full min-w-[1000px] text-left">
						<thead>
							<tr className="border-b border-border bg-muted/50 text-2xs uppercase text-muted-foreground">
								{[
									"API name",
									"Kind",
									"Source",
									"Consumers",
									"Breaking changes",
									"Status",
									"Last run",
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
							{filtered.map(({ api, lastRun, consumers }) => (
								<tr
									key={api.name}
									className="border-b border-border last:border-0 hover:bg-muted/40"
								>
									<td className="px-5 py-4 text-sm font-medium">{api.name}</td>
									<td className="px-5 py-4">
										<span className="rounded border border-border bg-muted px-2 py-1 text-xs">
											{api.kind}
										</span>
									</td>
									<td className="px-5 py-4 font-mono text-xs text-muted-foreground">
										{formatSource(api.source)}
									</td>
									<td className="px-5 py-4 font-mono text-xs">{consumers}</td>
									<td className="px-5 py-4 font-mono text-xs">
										{lastRun ? (
											<span
												className={cn(
													breakingChangeCount(lastRun) > 0 && "text-warning",
												)}
											>
												{breakingChangeCount(lastRun)}
											</span>
										) : (
											"—"
										)}
									</td>
									<td className="px-5 py-4">
										{lastRun ? (
											<StatusBadge status={runStatus(lastRun)} />
										) : (
											<StatusBadge status="Not yet checked" />
										)}
									</td>
									<td className="px-5 py-4 font-mono text-xs text-muted-foreground">
										{lastRun ? formatDateTime(lastRun.startedAt) : "Never"}
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
