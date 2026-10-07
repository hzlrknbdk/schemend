import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { ApisPage, kinds } from "@/features/apis/apis-page";

const searchSchema = z.object({
	q: z.string().optional().catch(undefined),
	kind: z.enum(kinds).optional().catch(undefined),
});

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
	validateSearch: searchSchema,
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
	const { q, kind } = Route.useSearch();
	const navigate = Route.useNavigate();

	return (
		<ApisPage
			apis={apis}
			runs={runs}
			query={q ?? ""}
			kind={kind ?? "All kinds"}
			onQueryChange={(value) =>
				navigate({
					search: (prev) => ({ ...prev, q: value === "" ? undefined : value }),
					replace: true,
				})
			}
			onKindChange={(value) =>
				navigate({
					search: (prev) => ({
						...prev,
						kind: value === "All kinds" ? undefined : value,
					}),
					replace: false,
				})
			}
		/>
	);
}
