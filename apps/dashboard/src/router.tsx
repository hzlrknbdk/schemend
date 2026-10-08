import { createRouter } from "@tanstack/react-router";
import { getRepository } from "./repository";
import { repositoryErrorSerializationAdapter } from "./repository/errors";
import { routeTree } from "./routeTree.gen";

export const getRouter = () => {
	// Not inlined into createRouter(...): RouterConstructorOptions's type omits
	// `serializationAdapters` even though the router reads `options.serializationAdapters` at
	// runtime (@tanstack/router-core's own type gap). Assigning to a variable first avoids an
	// `as` cast — TS only excess-property-checks object literals passed directly as arguments.
	const routerOptions = {
		routeTree,
		context: { repository: getRepository() },
		scrollRestoration: true,
		defaultPreloadStaleTime: 0,
		serializationAdapters: [repositoryErrorSerializationAdapter],
	};
	return createRouter(routerOptions);
};
