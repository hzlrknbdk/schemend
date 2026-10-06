import { Button } from "@schemend/ui";
import { ArrowRight, Github } from "lucide-react";
import { dashboardUrl, githubUrl } from "@/lib/links";

export function Cta() {
	return (
		<section className="bg-sidebar text-sidebar-foreground">
			<div className="mx-auto max-w-7xl px-5 py-20 sm:px-8">
				<h2 className="max-w-2xl text-3xl font-semibold sm:text-4xl">
					Try it on your own services.
				</h2>
				<p className="mt-4 max-w-2xl text-sm leading-7 text-sidebar-muted">
					Start with the read-only demo, then run a local impact check against
					your repositories.
				</p>
				<div className="mt-8 flex flex-wrap gap-3">
					<Button asChild size="lg">
						<a href={dashboardUrl} target="_blank" rel="noreferrer">
							Try the live demo <ArrowRight />
						</a>
					</Button>
					<Button
						asChild
						size="lg"
						variant="outline"
						className="border-sidebar-border bg-sidebar text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
					>
						<a href={githubUrl} target="_blank" rel="noreferrer">
							<Github />
							View on GitHub
						</a>
					</Button>
				</div>
			</div>
		</section>
	);
}
