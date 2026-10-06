import tailwindcss from "@tailwindcss/vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import viteTsConfigPaths from "vite-tsconfig-paths";

// A static marketing page: no server functions or loaders, so every route is prerendered
// to static HTML at build time and shipped without a server runtime.
export default defineConfig({
	plugins: [
		viteTsConfigPaths({ projects: ["./tsconfig.json"] }),
		tailwindcss(),
		tanstackStart({
			prerender: { enabled: true, crawlLinks: true },
		}),
		viteReact(),
	],
});
