import tailwindcss from "@tailwindcss/vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import viteTsConfigPaths from "vite-tsconfig-paths";

// "demo" mode (default) reads from MockRepository, which resolves synchronously, so every
// route can be prerendered to static HTML at build time, same as apps/landing. "local" mode
// reads from HttpRepository (schemend ui's future local server, v1.1), which doesn't exist at
// build time, so prerendering is skipped and the app ships as a client-rendered SPA shell.
// biome-ignore lint/complexity/useLiteralKeys: tsconfig's noPropertyAccessFromIndexSignature requires bracket notation here
const mode = process.env["VITE_SCHEMEND_MODE"] ?? "demo";

export default defineConfig({
	plugins: [
		viteTsConfigPaths({ projects: ["./tsconfig.json"] }),
		tailwindcss(),
		tanstackStart({
			prerender: { enabled: mode !== "local", crawlLinks: true },
		}),
		viteReact(),
	],
});
