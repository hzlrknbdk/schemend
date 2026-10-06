import { createFileRoute } from "@tanstack/react-router";
import { MigrationPage } from "@/features/migration/migration-page";

export const Route = createFileRoute("/migration")({
	head: () => ({
		meta: [
			{ title: "Migration Detail — Schemend" },
			{
				name: "description",
				content: "Review a generated migration and its verification results.",
			},
		],
	}),
	loader: ({ context }) => context.repository.listRuns(),
	component: MigrationRoute,
});

function MigrationRoute() {
	const runs = Route.useLoaderData();
	return <MigrationPage runs={runs} />;
}
