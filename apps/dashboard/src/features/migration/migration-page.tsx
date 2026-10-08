import {
	Button,
	Callout,
	Card,
	CopyCommand,
	cn,
	StatusBadge,
} from "@schemend/ui";
import {
	AlertTriangle,
	Check,
	Coins,
	ExternalLink,
	GitBranch,
} from "lucide-react";
import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import { EmptyState } from "@/components/dashboard/empty-state";
import { PageHeader } from "@/components/dashboard/page-header";
import { Section } from "@/components/dashboard/section";
import { formatCost } from "@/lib/format";
import { runStatusTone } from "@/lib/run-status";
import { isSafeUrl } from "@/lib/safe-url";
import type { CheckResult, RunReport } from "@/repository";
import { parseUnifiedDiff } from "./lib/diff";

export interface MigrationPageProps {
	run: RunReport | undefined;
	selectedFile: string | undefined;
	onSelectFile: (path: string) => void;
}

const checkStatusClasses: Record<CheckResult["status"], string> = {
	passed: "text-success",
	failed: "text-danger",
	skipped: "text-muted-foreground",
};

export function MigrationPage({
	run,
	selectedFile,
	onSelectFile,
}: MigrationPageProps) {
	const service =
		run?.services.find((candidate) => candidate.service === "checkout-web") ??
		run?.services[0];

	if (!run || !service) {
		return (
			<DashboardShell>
				<EmptyState
					title="Migration detail"
					description="A run appears here once schemend detects an API change. Try it locally:"
					action={<CopyCommand command="schemend check" />}
				/>
			</DashboardShell>
		);
	}

	const diffFiles = service.diff ? parseUnifiedDiff(service.diff) : [];
	const selectedIndex = Math.max(
		0,
		diffFiles.findIndex((file) => file.path === selectedFile),
	);
	const selectedDiff = diffFiles[selectedIndex];
	const reviewUrl =
		service.changeRequest && isSafeUrl(service.changeRequest.url)
			? service.changeRequest.url
			: undefined;

	return (
		<DashboardShell>
			<PageHeader
				eyebrow={`${run.api} migration`}
				title={service.service}
				description={`${service.language} · ${service.changedFiles.length} file${service.changedFiles.length === 1 ? "" : "s"} changed`}
				action={
					reviewUrl && (
						<Button asChild>
							<a href={reviewUrl} target="_blank" rel="noopener noreferrer">
								Review on GitHub <ExternalLink />
							</a>
						</Button>
					)
				}
			/>
			<Card className="mb-6 flex items-center gap-3 px-5 py-3 text-xs">
				<GitBranch className="size-4 text-muted-foreground" />
				<span className="text-muted-foreground">Branch</span>
				<code className="font-mono">{service.branch || "—"}</code>
				{service.changeRequest && (
					<span className="ml-auto">
						<StatusBadge
							tone={runStatusTone["PRs opened"]}
							label="PRs opened"
						/>
					</span>
				)}
			</Card>
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
					<Section
						title="Code changes"
						note={
							diffFiles.length > 0
								? `${diffFiles.length} file${diffFiles.length === 1 ? "" : "s"} changed`
								: undefined
						}
					>
						{diffFiles.length === 0 ? (
							<div className="p-8">
								<EmptyState
									title="No code changes"
									description="schemend verified this service without needing to change any files."
								/>
							</div>
						) : (
							<>
								<div className="flex border-b border-border bg-muted/40">
									{diffFiles.map((file, i) => (
										<button
											key={file.path}
											type="button"
											onClick={() => onSelectFile(file.path)}
											className={cn(
												"border-r border-border px-4 py-3 font-mono text-2xs text-muted-foreground",
												i === selectedIndex &&
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
							</>
						)}
					</Section>
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
						<Callout
							tone="warning"
							icon={AlertTriangle}
							title="Needs your review"
						>
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
						</Callout>
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
