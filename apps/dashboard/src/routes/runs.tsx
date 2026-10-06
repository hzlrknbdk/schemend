import { createFileRoute } from "@tanstack/react-router";
import { RunsPage } from "@/features/runs/runs-page";

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
	component: RunsRoute,
});

function RunsRoute() {
	const runs = Route.useLoaderData();
	return <RunsPage runs={runs} />;
}
