import { githubUrl } from "@/lib/links";

export function SiteFooter() {
	return (
		<footer className="border-t border-sidebar-border bg-sidebar text-sidebar-muted">
			<div className="mx-auto flex max-w-7xl flex-col gap-4 px-5 py-8 text-xs sm:flex-row sm:items-center sm:justify-between sm:px-8">
				<p>
					Built by{" "}
					<span className="text-sidebar-foreground">Hazal Ruken Budak</span>
				</p>
				<div className="flex gap-5">
					<span>MIT License</span>
					<a
						href="https://www.npmjs.com"
						target="_blank"
						rel="noopener noreferrer"
						className="hover:text-sidebar-foreground"
					>
						npm
					</a>
					<a
						href={githubUrl}
						target="_blank"
						rel="noopener noreferrer"
						className="hover:text-sidebar-foreground"
					>
						GitHub
					</a>
				</div>
			</div>
		</footer>
	);
}
