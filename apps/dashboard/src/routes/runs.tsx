import { createFileRoute } from "@tanstack/react-router";
import { RouteErrorState } from "@/components/dashboard/route-error-state";
import { RunsPage } from "@/features/runs/runs-page";
import { RunsPageSkeleton } from "@/features/runs/runs-page-skeleton";

export const Route = createFileRoute("/runs")({
	head: () => ({
		meta: [
			{ title: "Runs History — Schemend" },
			{
				name: "description",
				content: "Past API migration runs, outcomes, duration, and cost.",
			},
		],
	}),
	loader: ({ context }) => context.repository.listRuns(),
	pendingComponent: RunsPageSkeleton,
	errorComponent: RouteErrorState,
	component: RunsRoute,
});

function RunsRoute() {
	const runs = Route.useLoaderData();
	return <RunsPage runs={runs} />;
}
