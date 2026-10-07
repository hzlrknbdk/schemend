import { Callout, Card, Chip, cn } from "@schemend/ui";
import { Link } from "@tanstack/react-router";
import {
	ArrowRight,
	Braces,
	FileCode2,
	GitPullRequest,
	Server,
	ShieldAlert,
} from "lucide-react";
import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import { EmptyState } from "@/components/dashboard/empty-state";
import { PageHeader } from "@/components/dashboard/page-header";
import { Section } from "@/components/dashboard/section";
import { formatDateTime } from "@/lib/format";
import { runId } from "@/lib/run-status";
import type { RunReport } from "@/repository";

export interface ImpactPageProps {
	run: RunReport | undefined;
}

export function ImpactPage({ run }: ImpactPageProps) {
	if (!run) {
		return (
			<DashboardShell>
				<EmptyState title="Change impact" description="No runs recorded yet." />
			</DashboardShell>
		);
	}

	const breaking = run.changes.filter(
		(change) => change.severity === "breaking",
	);
	const nonBreaking = run.changes.filter(
		(change) => change.severity === "non-breaking",
	);
	const flagged = run.services.filter((service) => service.review.length > 0);

	return (
		<DashboardShell>
			<PageHeader
				eyebrow="Change impact"
				title={`${run.api} changed`}
				description={`${run.trigger?.detail ?? "Change detected"} · ${formatDateTime(run.startedAt)} · ${run.services.length} consumer service${run.services.length === 1 ? "" : "s"} affected`}
			/>
			<div className="mb-6 grid grid-cols-[1fr_280px] gap-6">
				<Section
					title="Schema changes"
					note={
						run.changes.length === 0
							? "Detected via package release, not oasdiff"
							: undefined
					}
				>
					<div className="p-5">
						{run.changes.length > 0 ? (
							<div className="rounded-md border border-border bg-code p-4 font-mono text-xs leading-6">
								{run.changes.map((change) => (
									<p
										key={change.id}
										className={
											change.severity === "breaking"
												? "text-danger"
												: "text-success"
										}
									>
										{change.severity === "breaking" ? "−" : "+"} {change.target}
										: {change.summary}
									</p>
								))}
							</div>
						) : (
							<p className="rounded-md border border-border bg-code p-4 font-mono text-xs leading-6 text-muted-foreground">
								{run.trigger?.detail}
							</p>
						)}
						<div className="mt-4 flex gap-6 text-xs">
							<span>
								<strong className="text-danger">{breaking.length}</strong>{" "}
								breaking changes
							</span>
							<span>
								<strong>{nonBreaking.length}</strong> non-breaking
							</span>
						</div>
					</div>
				</Section>
				{flagged.length > 0 && (
					<Callout
						tone="warning"
						icon={ShieldAlert}
						title="Human review required"
					>
						<p className="mt-2 text-xs leading-5 text-muted-foreground">
							{flagged[0]?.review[0]?.reason}
						</p>
						<p className="mt-4 font-mono text-xs text-warning">
							{flagged.length} service{flagged.length === 1 ? "" : "s"} flagged
						</p>
					</Callout>
				)}
			</div>
			<Section title="Impact map" note="Source API and every affected consumer">
				<div className="relative px-7 py-8">
					<div className="grid grid-cols-[250px_1fr] items-center gap-16">
						<Card className="relative z-10 border-2 border-primary p-5">
							<div className="flex items-center gap-3">
								<span className="flex size-9 items-center justify-center rounded-md bg-primary-soft text-primary">
									<Server className="size-4" />
								</span>
								<div>
									<p className="text-sm font-semibold">{run.api}</p>
									<p className="text-xs text-muted-foreground">Schema owner</p>
								</div>
							</div>
						</Card>
						<div className="relative grid grid-cols-2 gap-4 before:absolute before:-left-8 before:top-1/2 before:h-px before:w-8 before:bg-border">
							{run.services.map((service) => (
								<Card
									key={service.service}
									asChild
									className="group relative p-4 transition-all hover:border-primary/40 hover:shadow-sm before:absolute before:-left-8 before:top-1/2 before:h-px before:w-8 before:bg-border"
								>
									<Link to="/migration" search={{ run: runId(run) }}>
										<div className="flex items-start justify-between">
											<p className="text-sm font-semibold group-hover:text-primary">
												{service.service}
											</p>
											<Chip className="font-mono text-2xs">
												{service.language}
											</Chip>
										</div>
										<div className="mt-5 flex items-center justify-between border-t border-border pt-3 text-xs">
											<span className="flex items-center gap-1.5 text-muted-foreground">
												<FileCode2 className="size-3.5" />
												{service.changedFiles.length} files
											</span>
											<span
												className={cn(
													"flex items-center gap-1.5",
													service.review.length > 0
														? "text-warning"
														: "text-success",
												)}
											>
												<GitPullRequest className="size-3.5" />
												{service.review.length > 0
													? "Needs review"
													: "Verified"}
											</span>
										</div>
									</Link>
								</Card>
							))}
						</div>
					</div>
				</div>
			</Section>
			<div className="mt-6 grid grid-cols-4 gap-4">
				{run.services.map((service) => (
					<Card
						key={service.service}
						asChild
						className="p-4 hover:border-primary/40"
					>
						<Link to="/migration" search={{ run: runId(run) }}>
							<div className="flex justify-between">
								<Braces className="size-4 text-muted-foreground" />
								<span className="font-mono text-2xs text-muted-foreground">
									{service.confidence}
								</span>
							</div>
							<p className="mt-4 text-sm font-semibold">{service.service}</p>
							<p className="mt-1 text-xs text-muted-foreground">
								View migration detail <ArrowRight className="inline size-3" />
							</p>
						</Link>
					</Card>
				))}
			</div>
		</DashboardShell>
	);
}
