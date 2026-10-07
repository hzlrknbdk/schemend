import { createFileRoute, notFound } from "@tanstack/react-router";
import { z } from "zod";
import { MigrationPage } from "@/features/migration/migration-page";
import { runId } from "@/lib/run-status";

const searchSchema = z.object({
	run: z.string().optional().catch(undefined),
	file: z.string().optional().catch(undefined),
});

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
	component: MigrationRoute,
});

function MigrationRoute() {
	const { run } = Route.useLoaderData();
	const { file } = Route.useSearch();
	const navigate = Route.useNavigate();

	return (
		<MigrationPage
			run={run}
			selectedFile={file}
			onSelectFile={(path) =>
				navigate({ search: (prev) => ({ ...prev, file: path }) })
			}
		/>
	);
}
