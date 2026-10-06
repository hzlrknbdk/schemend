import { createFileRoute } from "@tanstack/react-router";
import { ImpactPage } from "@/features/impact/impact-page";

export const Route = createFileRoute("/impact")({
	head: () => ({
		meta: [
			{ title: "Change Impact — Schemend" },
			{
				name: "description",
				content: "Impact analysis for the most recent schema change.",
			},
		],
	}),
	loader: ({ context }) => context.repository.listRuns(),
	component: ImpactRoute,
});

function ImpactRoute() {
	const runs = Route.useLoaderData();
	return <ImpactPage runs={runs} />;
}
