import { Button, cn } from "@schemend/ui";
import { createFileRoute } from "@tanstack/react-router";
import {
	AlertTriangle,
	Check,
	Coins,
	ExternalLink,
	GitBranch,
} from "lucide-react";
import { useState } from "react";
import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import { EmptyState } from "@/components/dashboard/empty-state";
import { PageHeader } from "@/components/dashboard/page-header";
import { Section } from "@/components/dashboard/section";
import { StatusBadge } from "@/components/dashboard/status-badge";
import { parseUnifiedDiff } from "@/lib/diff";
import { formatCost } from "@/lib/format";

export const Route = createFileRoute("/migration")({
	head: () => ({
		meta: [
			{ title: "Migration Detail — Schemend" },
			{
				name: "description",
				content: "Review a generated migration and its verification results.",
			},
		],
	}),
	loader: ({ context }) => context.repository.listRuns(),
	component: Migration,
});

const checkStatusClasses: Record<string, string> = {
	passed: "text-success",
	failed: "text-danger",
	skipped: "text-muted-foreground",
};

function Migration() {
	const runs = Route.useLoaderData();
	const run =
		runs.find((candidate) => candidate.api === "orders-service") ?? runs[0];
	const service =
		run?.services.find((candidate) => candidate.service === "checkout-web") ??
		run?.services[0];
	const [selectedFile, setSelectedFile] = useState(0);

	if (!run || !service) {
		return (
			<DashboardShell>
				<EmptyState
					title="Migration detail"
					description="No runs recorded yet."
				/>
			</DashboardShell>
		);
	}

	const diffFiles = service.diff ? parseUnifiedDiff(service.diff) : [];
	const selectedDiff = diffFiles[selectedFile];

	return (
		<DashboardShell>
			<PageHeader
				eyebrow={`${run.api} migration`}
				title={service.service}
				description={`${service.language} · ${service.changedFiles.length} file${service.changedFiles.length === 1 ? "" : "s"} changed`}
				action={
					service.changeRequest && (
						<Button asChild>
							<a
								href={service.changeRequest.url}
								target="_blank"
								rel="noreferrer"
							>
								Review on GitHub <ExternalLink />
							</a>
						</Button>
					)
				}
			/>
			<div className="mb-6 flex items-center gap-3 rounded-lg border border-border bg-card px-5 py-3 text-xs">
				<GitBranch className="size-4 text-muted-foreground" />
				<span className="text-muted-foreground">Branch</span>
				<code className="font-mono">{service.branch || "—"}</code>
				{service.changeRequest && (
					<span className="ml-auto">
						<StatusBadge status="PRs opened" />
					</span>
				)}
			</div>
			<div className="grid grid-cols-[minmax(0,1fr)_320px] gap-6">
				<div className="space-y-6">
					<Section title="Steps taken" note="In order">
						<ol className="flex flex-wrap divide-x divide-border">
							{service.steps.map((step, i) => (
								<li key={step} className="min-w-[140px] flex-1 p-4">
									<span className="flex size-6 items-center justify-center rounded-full bg-success-soft text-xs font-semibold text-success">
										{i + 1}
									</span>
									<p className="mt-3 text-xs capitalize leading-5">{step}</p>
								</li>
							))}
						</ol>
					</Section>
					{diffFiles.length > 0 && (
						<Section
							title="Code changes"
							note={`${diffFiles.length} file${diffFiles.length === 1 ? "" : "s"} changed`}
						>
							<div className="flex border-b border-border bg-muted/40">
								{diffFiles.map((file, i) => (
									<button
										key={file.path}
										type="button"
										onClick={() => setSelectedFile(i)}
										className={cn(
											"border-r border-border px-4 py-3 font-mono text-2xs text-muted-foreground",
											i === selectedFile &&
												"bg-card text-foreground shadow-[inset_0_-2px_0_var(--primary)]",
										)}
									>
										{file.path.split("/").pop()}
									</button>
								))}
							</div>
							<div className="overflow-hidden bg-code py-3 font-mono text-xs leading-6">
								{selectedDiff?.lines.map((line, i) => (
									<div
										// biome-ignore lint/suspicious/noArrayIndexKey: static diff lines, order never changes
										key={`${line.text}-${i}`}
										className={cn(
											"grid grid-cols-[42px_1fr] px-3",
											line.type === "remove" && "bg-danger-soft text-danger",
											line.type === "add" && "bg-success-soft text-success",
											line.type === "context" && "text-code-foreground",
										)}
									>
										<span className="select-none text-right text-muted-foreground/60">
											{i + 1}
										</span>
										<pre className="pl-4">{line.text || " "}</pre>
									</div>
								))}
							</div>
						</Section>
					)}
				</div>
				<div className="space-y-6">
					<Section title="Verification">
						<div className="divide-y divide-border">
							{service.checks.map((check) => (
								<div
									key={check.name}
									className="flex items-center justify-between px-4 py-3 text-xs"
								>
									<span className="capitalize">{check.name}</span>
									<span
										className={cn(
											"flex items-center gap-1.5 font-mono",
											checkStatusClasses[check.status],
										)}
									>
										{check.status === "passed" && (
											<Check className="size-3.5" />
										)}
										{check.detail ?? check.status}
									</span>
								</div>
							))}
						</div>
					</Section>
					{service.review.length > 0 && (
						<div className="rounded-lg border border-warning/35 bg-warning-soft p-5">
							<AlertTriangle className="size-5 text-warning" />
							<h2 className="mt-3 text-sm font-semibold">Needs your review</h2>
							{service.review.map((item) => (
								<p
									key={item.file}
									className="mt-2 text-xs leading-5 text-muted-foreground"
								>
									{item.reason}
								</p>
							))}
							<div className="mt-4 border-t border-warning/20 pt-3 font-mono text-2xs text-warning">
								{service.review[0]?.file}
							</div>
						</div>
					)}
					<Section title="Run cost">
						<div className="p-5">
							<div className="flex items-center gap-3">
								<Coins className="size-4 text-muted-foreground" />
								<div>
									<p className="font-mono text-lg font-semibold">
										{formatCost(service.costUsd)}
									</p>
									<p className="text-2xs text-muted-foreground">this service</p>
								</div>
							</div>
						</div>
					</Section>
				</div>
			</div>
		</DashboardShell>
	);
}
