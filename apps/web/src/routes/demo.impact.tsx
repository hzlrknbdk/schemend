import { createFileRoute, Link } from "@tanstack/react-router";
import {
	ArrowRight,
	Braces,
	FileCode2,
	GitPullRequest,
	Server,
	ShieldAlert,
} from "lucide-react";
import {
	DashboardShell,
	PageHeader,
	Section,
} from "@/components/schemend/dashboard-shell";
import { services } from "@/data/schemend-data";

export const Route = createFileRoute("/demo/impact")({
	head: () => ({
		meta: [
			{ title: "Change Impact — Schemend" },
			{
				name: "description",
				content: "Impact analysis for the orders-service schema change.",
			},
			{ property: "og:title", content: "Change Impact — Schemend" },
			{
				property: "og:description",
				content: "Impact analysis for the orders-service schema change.",
			},
			{ property: "og:type", content: "website" },
			{ name: "twitter:card", content: "summary_large_image" },
		],
	}),
	component: Impact,
});
function Impact() {
	return (
		<DashboardShell>
			<PageHeader
				eyebrow="Run #run_8f3a2c"
				title="orders-service schema changed"
				description="OpenAPI v2.8.1 → v2.9.0 · Detected 18 minutes ago · 4 consumer services affected"
			/>
			<div className="mb-6 grid grid-cols-[1fr_280px] gap-6">
				<Section title="Schema diff summary">
					<div className="p-5">
						<div className="rounded-md border border-border bg-code p-4 font-mono text-xs leading-6">
							<p className="text-muted-foreground">OrderResponse</p>
							<p className="text-danger">− totalPrice: number</p>
							<p className="text-success">+ total: {"{"}</p>
							<p className="pl-4 text-success">+ amount: number</p>
							<p className="pl-4 text-success">+ currency: string</p>
							<p className="text-success">+ {"}"}</p>
						</div>
						<div className="mt-4 flex gap-6 text-xs">
							<span>
								<strong className="text-danger">3</strong> breaking changes
							</span>
							<span>
								<strong>2</strong> additions
							</span>
							<span>
								<strong>1</strong> type changed
							</span>
						</div>
					</div>
				</Section>
				<div className="rounded-lg border border-warning/30 bg-warning-soft p-5">
					<ShieldAlert className="size-5 text-warning" />
					<h2 className="mt-4 text-sm font-semibold">Human review required</h2>
					<p className="mt-2 text-xs leading-5 text-muted-foreground">
						Currency inference in notification-service is ambiguous. The agent
						prepared a safe partial migration.
					</p>
					<p className="mt-4 font-mono text-xs text-warning">confidence 76%</p>
				</div>
			</div>
			<Section
				title="Impact map"
				note="Source schema and every affected consumer"
			>
				<div className="relative px-7 py-8">
					<div className="grid grid-cols-[250px_1fr] items-center gap-16">
						<div className="relative z-10 rounded-lg border-2 border-primary bg-card p-5">
							<div className="flex items-center gap-3">
								<span className="flex size-9 items-center justify-center rounded-md bg-primary-soft text-primary">
									<Server className="size-4" />
								</span>
								<div>
									<p className="text-sm font-semibold">orders-service</p>
									<p className="text-xs text-muted-foreground">
										Schema owner · FastAPI
									</p>
								</div>
							</div>
							<div className="mt-4 border-t border-border pt-3 font-mono text-xs">
								<span>v2.8.1</span>
								<ArrowRight className="mx-2 inline size-3" />
								<span className="text-primary">v2.9.0</span>
							</div>
						</div>
						<div className="relative grid grid-cols-2 gap-4 before:absolute before:-left-8 before:top-1/2 before:h-px before:w-8 before:bg-border">
							{services.map((service) => (
								<Link
									key={service.name}
									to="/demo/migration"
									className="group relative rounded-lg border border-border bg-card p-4 transition-all hover:border-primary/40 hover:shadow-sm before:absolute before:-left-8 before:top-1/2 before:h-px before:w-8 before:bg-border"
								>
									<div className="flex items-start justify-between">
										<div>
											<p className="text-sm font-semibold group-hover:text-primary">
												{service.name}
											</p>
											<p className="mt-1 text-xs text-muted-foreground">
												{service.framework}
											</p>
										</div>
										<span className="rounded border border-border bg-muted px-2 py-1 font-mono text-[10px]">
											{service.language}
										</span>
									</div>
									<div className="mt-5 flex items-center justify-between border-t border-border pt-3 text-xs">
										<span className="flex items-center gap-1.5 text-muted-foreground">
											<FileCode2 className="size-3.5" />
											{service.files} files
										</span>
										<span
											className={`flex items-center gap-1.5 text-${service.tone}`}
										>
											<GitPullRequest className="size-3.5" />
											{service.status}
										</span>
									</div>
								</Link>
							))}
						</div>
					</div>
				</div>
			</Section>
			<div className="mt-6 grid grid-cols-4 gap-4">
				{services.map((s) => (
					<Link
						key={s.name}
						to="/demo/migration"
						className="rounded-lg border border-border bg-card p-4 hover:border-primary/40"
					>
						<div className="flex justify-between">
							<Braces className="size-4 text-muted-foreground" />
							<span className="font-mono text-[10px] text-muted-foreground">
								{s.confidence}
							</span>
						</div>
						<p className="mt-4 text-sm font-semibold">{s.name}</p>
						<p className="mt-1 text-xs text-muted-foreground">
							View migration detail <ArrowRight className="inline size-3" />
						</p>
					</Link>
				))}
			</div>
		</DashboardShell>
	);
}
