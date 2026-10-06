import { Link, useRouterState } from "@tanstack/react-router";
import {
	Activity,
	ArrowLeft,
	Boxes,
	Cable,
	Github,
	GitPullRequest,
	History,
	LayoutDashboard,
	Settings,
} from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

const landingUrl = import.meta.env.VITE_LANDING_URL ?? "https://schemend.dev";

const navigation = [
	{ label: "Overview", to: "/", icon: LayoutDashboard },
	{ label: "API inventory", to: "/apis", icon: Boxes },
	{ label: "Change impact", to: "/impact", icon: Activity },
	{ label: "Migration detail", to: "/migration", icon: GitPullRequest },
	{ label: "Runs history", to: "/runs", icon: History },
	{ label: "Settings", to: "/settings", icon: Settings },
] as const;

interface DashboardShellProps {
	children: ReactNode;
}

export function DashboardShell({ children }: DashboardShellProps) {
	const pathname = useRouterState({
		select: (state) => state.location.pathname,
	});
	return (
		<div className="min-h-screen min-w-[768px] bg-background text-foreground">
			<aside className="fixed inset-y-0 left-0 z-30 flex w-60 flex-col bg-sidebar text-sidebar-foreground">
				<div className="flex h-16 items-center gap-3 border-b border-sidebar-border px-5">
					<div className="flex size-8 items-center justify-center rounded-md bg-sidebar-primary text-sidebar-primary-foreground">
						<Cable className="size-4" />
					</div>
					<span className="text-lg font-semibold tracking-normal">
						Schemend
					</span>
					<span className="ml-auto rounded border border-sidebar-border px-1.5 py-0.5 font-mono text-3xs text-sidebar-muted">
						OSS
					</span>
				</div>
				<nav className="flex-1 space-y-1 p-3" aria-label="Main navigation">
					<p className="px-3 pb-2 pt-3 text-3xs font-semibold uppercase text-sidebar-muted">
						Workspace
					</p>
					{navigation.map((item) => {
						const isActive =
							item.to === "/" ? pathname === "/" : pathname.startsWith(item.to);
						return (
							<Link
								key={item.to}
								to={item.to}
								activeOptions={{ exact: true }}
								className={cn(
									"flex h-10 items-center gap-3 rounded-md px-3 text-sm text-sidebar-muted transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
									isActive &&
										"bg-sidebar-accent text-sidebar-accent-foreground",
								)}
							>
								<item.icon
									className={cn("size-4", isActive && "text-sidebar-primary")}
								/>
								<span>{item.label}</span>
							</Link>
						);
					})}
				</nav>
				<div className="border-t border-sidebar-border p-4">
					<a
						href={landingUrl}
						className="mb-4 flex items-center gap-2 text-xs text-sidebar-muted transition-colors hover:text-sidebar-foreground"
					>
						<ArrowLeft className="size-3.5" />
						Back to schemend.dev
					</a>
					<div className="mb-3 flex items-center gap-2 text-xs text-sidebar-muted">
						<span className="size-2 rounded-full bg-success" />
						Agent operational
					</div>
					<div className="flex items-center justify-between">
						<a
							href="https://github.com/hzlrknbdk/schemend"
							target="_blank"
							rel="noreferrer"
							className="text-sidebar-muted hover:text-sidebar-foreground"
							aria-label="GitHub"
						>
							<Github className="size-4" />
						</a>
						<span className="font-mono text-3xs text-sidebar-muted">
							v0.8.4
						</span>
					</div>
				</div>
			</aside>
			<main className="ml-60 min-h-screen">
				<div className="mx-auto max-w-[1440px] p-8 lg:p-10">{children}</div>
			</main>
		</div>
	);
}
