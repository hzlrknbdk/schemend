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
  VITE_LANDING_URL: z.httpUrl().default("https://schemend.dev"),
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
        // "demo" resolves synchronously (MockRepository), so it prerenders at build time;
        // "local" reads HttpRepository's future server (v1.1) and ships as an SPA shell instead.
        prerender: {
          enabled: env.VITE_SCHEMEND_MODE !== "local",
          crawlLinks: true,
          // Works around an upstream crawler bug that 404s a query-string route (e.g.
          // /impact?run=...) - the query string never affects which static file is served anyway.
          filter: (page) => !page.path.includes("?"),
        },
      }),
      viteReact(),
    ],
  };
});
