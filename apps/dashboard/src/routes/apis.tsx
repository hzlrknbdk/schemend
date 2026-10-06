import { createFileRoute } from "@tanstack/react-router";
import { ApisPage } from "@/features/apis/apis-page";

export const Route = createFileRoute("/apis")({
	head: () => ({
		meta: [
			{ title: "API Inventory — Schemend" },
			{
				name: "description",
				content: "Discovered internal APIs and external SDK dependencies.",
			},
		],
	}),
	loader: async ({ context }) => {
		const [apis, runs] = await Promise.all([
			context.repository.listApis(),
			context.repository.listRuns(),
		]);
		return { apis, runs };
	},
	component: ApisRoute,
});

function ApisRoute() {
	const { apis, runs } = Route.useLoaderData();
	return <ApisPage apis={apis} runs={runs} />;
}
