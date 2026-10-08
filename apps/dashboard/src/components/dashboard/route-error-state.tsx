import { type ErrorComponentProps, useRouter } from "@tanstack/react-router";
import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import { ErrorState } from "@/components/dashboard/error-state";
import { type NormalizedError, normalizeError } from "@/repository";

interface ErrorCopy {
	title: string;
	description: string;
	detail?: string | undefined;
	canRetry: boolean;
}

function describeError(error: NormalizedError): ErrorCopy {
	switch (error.kind) {
		case "network":
			return {
				title: "Can't reach the local server",
				description: "Make sure schemend ui is running, then try again.",
				canRetry: true,
			};
		case "not-found":
			return {
				title: "Data not found",
				description:
					"The local server didn't have this data. It may not be exposed yet.",
				canRetry: false,
			};
		case "server":
			return {
				title: "Server error",
				description: "The local server ran into a problem loading this data.",
				canRetry: true,
			};
		case "validation":
			return {
				title: "Unexpected data from the server",
				description:
					"The local server returned data in a shape this dashboard doesn't recognize.",
				detail: error.detail,
				canRetry: false,
			};
		case "unknown":
			return {
				title: "Something went wrong",
				description: "An unexpected error occurred while loading this page.",
				canRetry: false,
			};
		default:
			return error satisfies never;
	}
}

/**
 * Shared `errorComponent` for every dashboard route with a loader. Keeps DashboardShell (and
 * its nav) on screen instead of falling through to root's full-page error — only this route's
 * content area shows the failure.
 */
export function RouteErrorState({ error, reset }: ErrorComponentProps) {
	const router = useRouter();
	const copy = describeError(normalizeError(error));

	return (
		<DashboardShell>
			<ErrorState
				title={copy.title}
				description={copy.description}
				detail={copy.detail}
				onRetry={
					copy.canRetry
						? () => {
								router.invalidate();
								reset();
							}
						: undefined
				}
			/>
		</DashboardShell>
	);
}
