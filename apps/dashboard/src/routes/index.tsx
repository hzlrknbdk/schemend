import { createFileRoute } from "@tanstack/react-router";
import { OverviewPage } from "@/features/overview/overview-page";

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
	component: OverviewRoute,
});

function OverviewRoute() {
	const runs = Route.useLoaderData();
	return <OverviewPage runs={runs} />;
}
