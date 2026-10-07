import { Button, Chip, cn, StatusBadge, type Tone } from "@schemend/ui";
import { ArrowUpDown, Search, SlidersHorizontal } from "lucide-react";
import { useMemo } from "react";
import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import { PageHeader } from "@/components/dashboard/page-header";
import { Section } from "@/components/dashboard/section";
import { Input } from "@/components/ui/input";
import { formatDateTime } from "@/lib/format";
import {
	breakingChangeCount,
	type RunStatus,
	runStatus,
	runStatusTone,
} from "@/lib/run-status";
import type { ApiEntry, RunReport } from "@/repository";

export const kinds = ["All kinds", "internal", "external"] as const;

export type ApiKindFilter = (typeof kinds)[number];

export interface ApisPageProps {
	apis: ApiEntry[];
	runs: RunReport[];
	query: string;
	kind: ApiKindFilter;
	onQueryChange: (value: string) => void;
	onKindChange: (value: ApiKindFilter) => void;
}

type ApiStatus = RunStatus | "Not yet checked";

const apiStatusTone: Record<ApiStatus, Tone> = {
	...runStatusTone,
	"Not yet checked": "neutral",
};

function apiStatus(lastRun: RunReport | undefined): ApiStatus {
	return lastRun ? runStatus(lastRun) : "Not yet checked";
}

function formatSource(source: ApiEntry["source"]): string {
	switch (source.type) {
		case "openapi":
			return source.location;
		case "package":
			return `${source.ecosystem} · ${source.name}@${source.version}`;
		default:
			return source satisfies never;
	}
}

export function ApisPage({
	apis,
	runs,
	query,
	kind,
	onQueryChange,
	onKindChange,
}: ApisPageProps) {
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
						onChange={(e) => onQueryChange(e.target.value)}
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
							onClick={() => onKindChange(item)}
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
										<Chip>{api.kind}</Chip>
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
										<StatusBadge
											tone={apiStatusTone[apiStatus(lastRun)]}
											label={apiStatus(lastRun)}
										/>
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
