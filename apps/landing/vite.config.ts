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
	VITE_DASHBOARD_URL: z.string().default("https://demo.schemend.dev"),
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
			// A static marketing page: no server functions or loaders, so every route is
			// prerendered to static HTML at build time and shipped without a server runtime.
			tanstackStart({
				prerender: { enabled: true, crawlLinks: true },
			}),
			viteReact(),
		],
	};
});
