import tailwindcss from "@tailwindcss/vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import { defineConfig, loadEnv } from "vite";
import viteTsConfigPaths from "vite-tsconfig-paths";
import { z } from "zod";

// Parsed once, here, at build/dev-server start — never in the browser (see src/env.ts). A
// missing/invalid VITE_* value fails the build immediately instead of surfacing later as, say,
// "https://undefined" somewhere in the UI.
const EnvSchema = z.object({
	VITE_SCHEMEND_MODE: z.enum(["demo", "local"]).default("demo"),
	VITE_LANDING_URL: z.string().default("https://schemend.dev"),
	// Manual QA lever for MockRepository (demo mode only) — exercises error/loading/empty
	// states that real fixture data never produces on its own. See conventions.md §11.
	VITE_MOCK_SCENARIO: z
		.enum([
			"default",
			"empty",
			"network-error",
			"not-found-error",
			"server-error",
			"validation-error",
			"slow",
		])
		.default("default"),
});

export default defineConfig(({ mode }) => {
	const env = EnvSchema.parse(loadEnv(mode, process.cwd(), "VITE_"));

	return {
		define: {
			// Inlined as a literal at build time; read back, typed, through src/env.ts only.
			__SCHEMEND_ENV__: JSON.stringify(env),
		},
		plugins: [
			viteTsConfigPaths({ projects: ["./tsconfig.json"] }),
			tailwindcss(),
			tanstackStart({
				// "demo" mode (default) reads from MockRepository, which resolves synchronously, so
				// every route can be prerendered to static HTML at build time, same as apps/landing.
				// "local" mode reads from HttpRepository (schemend ui's future local server, v1.1),
				// which doesn't exist at build time, so prerendering is skipped and the app ships as
				// a client-rendered SPA shell.
				prerender: {
					enabled: env.VITE_SCHEMEND_MODE !== "local",
					crawlLinks: true,
					// Query-string variants of an already-prerendered route (e.g. /impact?run=...)
					// serve the same static index.html on any static host — the query string never
					// affects file resolution, only client-side hydration does. Also works around an
					// upstream bug: @tanstack/start-plugin-core's crawler appends a trailing slash
					// after the query string instead of before it, producing a 404 for any crawled
					// link that has a search param.
					filter: (page) => !page.path.includes("?"),
				},
			}),
			viteReact(),
		],
	};
});
