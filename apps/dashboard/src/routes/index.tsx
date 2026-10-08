import { createFileRoute } from "@tanstack/react-router";
import { RouteErrorState } from "@/components/dashboard/route-error-state";
import { OverviewPage } from "@/features/overview/overview-page";
import { OverviewPageSkeleton } from "@/features/overview/overview-page-skeleton";

export const Route = createFileRoute("/")({
	head: () => ({
		meta: [
			{ title: "Overview — Schemend" },
			{
				name: "description",
				content: "Monitor API changes and migration pull requests.",
			},
		],
	}),
	loader: ({ context }) => context.repository.listRuns(),
	pendingComponent: OverviewPageSkeleton,
	errorComponent: RouteErrorState,
	component: OverviewRoute,
});

function OverviewRoute() {
	const runs = Route.useLoaderData();
	return <OverviewPage runs={runs} />;
}
