import { createRouter } from "@tanstack/react-router";
import { getRepository } from "./repository";
import { routeTree } from "./routeTree.gen";

export const getRouter = () => {
	const router = createRouter({
		routeTree,
		context: { repository: getRepository() },
		scrollRestoration: true,
		defaultPreloadStaleTime: 0,
	});

	return router;
};
