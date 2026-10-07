import { Button, cn } from "@schemend/ui";
import { ArrowRight, Github, Play, Server } from "lucide-react";
import { CopyCommand } from "@/components/copy-command";
import { dashboardUrl, githubUrl } from "@/lib/links";

function DemoPoster() {
	return (
		<div className="relative overflow-hidden rounded-lg border border-border bg-card shadow-sm">
			<div className="flex h-10 items-center gap-2 border-b border-border px-4">
				<span className="size-2.5 rounded-full bg-danger" />
				<span className="size-2.5 rounded-full bg-warning" />
				<span className="size-2.5 rounded-full bg-success" />
				<span className="ml-2 font-mono text-4xs text-muted-foreground">
					app.schemend.dev/impact
				</span>
			</div>
			<div className="aspect-video p-4 sm:p-5">
				<div className="flex h-full gap-3">
					<div className="hidden w-24 shrink-0 rounded bg-sidebar p-3 sm:block">
						<div className="h-2 w-12 rounded bg-sidebar-primary" />
						<div className="mt-5 space-y-3">
							{[1, 2, 3, 4, 5].map((i) => (
								<div key={i} className="h-1.5 rounded bg-sidebar-border" />
							))}
						</div>
					</div>
					<div className="min-w-0 flex-1">
						<p className="font-mono text-4xs uppercase text-primary">
							Run #run_8f3a2c
						</p>
						<h3 className="mt-1 text-xs font-semibold sm:text-sm">
							orders-service schema changed
						</h3>
						<div className="mt-4 grid h-[65%] grid-cols-[0.75fr_1fr] items-center gap-5">
							<div className="rounded border-2 border-primary bg-background p-3">
								<Server className="size-4 text-primary" />
								<p className="mt-2 text-4xs font-semibold">orders-service</p>
								<p className="font-mono text-4xs text-muted-foreground">
									v2.8.1 → v2.9.0
								</p>
							</div>
							<div className="space-y-2">
								{[
									["checkout-web", "Passed"],
									["invoice-service", "Passed"],
									["notification-service", "Review"],
								].map(([name, status]) => (
									<div
										key={name}
										className="flex items-center justify-between rounded border border-border bg-background p-2"
									>
										<span className="truncate text-4xs font-medium">
											{name}
										</span>
										<span
											className={cn(
												"font-mono text-4xs",
												status === "Review" ? "text-warning" : "text-success",
											)}
										>
											{status}
										</span>
									</div>
								))}
							</div>
						</div>
					</div>
				</div>
			</div>
			<a
				href={dashboardUrl}
				target="_blank"
				rel="noreferrer"
				aria-label="Open impact demo"
				className="absolute inset-0 flex items-center justify-center bg-foreground/0 transition-colors hover:bg-foreground/5"
			>
				<span className="flex size-12 items-center justify-center rounded-full bg-primary text-primary-foreground shadow">
					<Play className="ml-0.5 size-5" fill="currentColor" />
				</span>
			</a>
		</div>
	);
}

export function Hero() {
	return (
		<section className="border-b border-border">
			<div className="mx-auto grid max-w-7xl gap-14 px-5 py-20 sm:px-8 lg:grid-cols-[1fr_0.9fr] lg:items-center lg:py-28">
				<div>
					<p className="mb-5 font-mono text-xs font-medium uppercase text-primary">
						Open-source · runs in your CI
					</p>
					<h1 className="max-w-3xl text-4xl font-semibold leading-[1.08] sm:text-5xl lg:text-6xl">
						Your API changed. Your services update themselves.
					</h1>
					<p className="mt-6 max-w-2xl text-lg leading-8 text-muted-foreground">
						An open-source AI agent that finds code affected by API changes,
						fixes it across TypeScript, Java and C# services, and opens a pull
						request you review.
					</p>
					<div className="mt-8 flex flex-wrap gap-3">
						<Button asChild size="lg">
							<a href={dashboardUrl} target="_blank" rel="noreferrer">
								Try the live demo <ArrowRight />
							</a>
						</Button>
						<Button asChild size="lg" variant="outline">
							<a href={githubUrl} target="_blank" rel="noreferrer">
								<Github />
								View on GitHub
							</a>
						</Button>
					</div>
					<div className="mt-8 max-w-lg">
						<CopyCommand command="pnpm dlx schemend init" />
					</div>
				</div>
				<DemoPoster />
			</div>
		</section>
	);
}
