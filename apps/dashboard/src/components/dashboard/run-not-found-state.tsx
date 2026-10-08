import { Button } from "@schemend/ui";
import { Link } from "@tanstack/react-router";
import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import { NotFoundState } from "@/components/dashboard/not-found-state";

/**
 * Shared `notFoundComponent` for `/migration` and `/impact` — both throw `notFound()` for the
 * same reason (conventions.md §16: a `run` search param that doesn't match any run), so both
 * get the same specific message instead of falling through to root's generic 404.
 */
export function RunNotFoundState() {
	return (
		<DashboardShell>
			<NotFoundState
				title="Run not found"
				description="This run doesn't exist, or the link to it is out of date."
				action={
					<Button asChild variant="outline" size="sm">
						<Link to="/runs">Back to runs</Link>
					</Button>
				}
			/>
		</DashboardShell>
	);
}
