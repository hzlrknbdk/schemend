import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { LanguageAdapter } from "@schemend/core";
import {
  build,
  summarizeBuildFailure,
  summarizeTestResult,
  test,
} from "./checks.js";
import {
  assertDockerVisibility,
  discoverApis,
  regenerateClient,
} from "./discover.js";
import { findAffected } from "./impact.js";
import { detect, resolveBuildTarget } from "./project.js";

// Resolves next to this module both in dev (src/adapter.ts) and in the published package
// (dist/adapter.mjs), since docker/ sits one level up from each.
const DOCKERFILE = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../docker/Dockerfile",
);

// Tags the image with the Dockerfile's own content hash, same reasoning as the TypeScript/Java
// adapters' image tag: ensureDockerImage only rebuilds when the tag is unknown.
const DOCKERFILE_HASH = createHash("sha256")
  .update(readFileSync(DOCKERFILE))
  .digest("hex")
  .slice(0, 8);

export const csharpAdapter: LanguageAdapter = {
  id: "csharp",
  detect,
  discoverApis,
  regenerateClient,
  // Ambiguity (multiple NSwag-bearing or multiple test projects with no .sln/.slnx to
  // disambiguate) is a layout schemend v1 doesn't support - resolveBuildTarget already throws a
  // clear error for it; this just runs that check up front, before any Docker setup starts.
  assertSupportedLayout: async (root) => {
    await resolveBuildTarget(root);
  },
  assertDockerVisibility,
  findAffected,
  build,
  test,
  summarizeBuildFailure,
  summarizeTestResult,
  dockerImage: `schemend-lang-csharp:sdk10.0-${DOCKERFILE_HASH}`,
  dockerfile: DOCKERFILE,
  // Must restore the exact same target build/test/findAffected use (SPEC §4) - a .sln/.slnx if
  // one sits at root, else the test project (restoring it also resolves the main project's
  // packages transitively via ProjectReference), else the main project alone.
  installCommand: async (root) => {
    const target = await resolveBuildTarget(root);
    return `dotnet restore ${target.commandPath}`;
  },
  // No single, fixed-name file sits reliably at root the way pnpm-lock.yaml/pom.xml do (see
  // DECISIONS.md) - the main project's own .csproj stands in for both the standalone-project
  // existence check and the dependency volume's content hash.
  lockfile: async (root) => {
    const target = await resolveBuildTarget(root);
    return target.mainProject.path;
  },
  // No NuGet-hoisting-across-ancestors risk the way pnpm has (same reasoning as Java's).
  workspaceMarkers: [],
  dependencyVolumePath: "/opt/nuget-packages",
};
