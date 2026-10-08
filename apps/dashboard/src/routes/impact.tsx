import { createFileRoute, notFound } from "@tanstack/react-router";
import { z } from "zod";
import { RouteErrorState } from "@/components/dashboard/route-error-state";
import { RunNotFoundState } from "@/components/dashboard/run-not-found-state";
import { ImpactPage } from "@/features/impact/impact-page";
import { ImpactPageSkeleton } from "@/features/impact/impact-page-skeleton";
import { runId } from "@/lib/run-status";

const searchSchema = z.object({
	run: z.string().optional().catch(undefined),
});

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
	validateSearch: searchSchema,
	loaderDeps: ({ search }) => ({ run: search.run }),
	loader: async ({ context, deps }) => {
		const runs = await context.repository.listRuns();
		const sorted = [...runs].sort((a, b) =>
			b.startedAt.localeCompare(a.startedAt),
		);
		const run = deps.run
			? sorted.find((candidate) => runId(candidate) === deps.run)
			: sorted[0];
		if (deps.run && !run) throw notFound();
		return { run };
	},
	pendingComponent: ImpactPageSkeleton,
	errorComponent: RouteErrorState,
	notFoundComponent: RunNotFoundState,
	component: ImpactRoute,
});

function ImpactRoute() {
	const { run } = Route.useLoaderData();
	return <ImpactPage run={run} />;
}
