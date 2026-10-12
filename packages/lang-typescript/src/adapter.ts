import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { LanguageAdapter } from "@schemend/core";
import { build, test } from "./checks.js";
import { detect, discoverApis, regenerateClient } from "./discover.js";
import { findAffected } from "./impact.js";

// Resolves next to this module both in dev (src/adapter.ts) and in the published package
// (dist/adapter.mjs), since docker/ sits one level up from each.
const DOCKERFILE = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../docker/Dockerfile",
);

// Tags the image with the Dockerfile's own content hash, not just the node/pnpm versions it
// names: ensureDockerImage only rebuilds when the tag is unknown, so a Dockerfile edit with no
// version bump (e.g. an added ENV) would otherwise keep reusing the stale cached image forever.
const DOCKERFILE_HASH = createHash("sha256")
  .update(readFileSync(DOCKERFILE))
  .digest("hex")
  .slice(0, 8);

export const typescriptAdapter: LanguageAdapter = {
  id: "typescript",
  detect,
  discoverApis,
  regenerateClient,
  findAffected,
  build,
  test,
  dockerImage: `schemend-lang-typescript:24.21.0-pnpm10.18.3-${DOCKERFILE_HASH}`,
  dockerfile: DOCKERFILE,
  installCommand: "pnpm install --frozen-lockfile",
  lockfile: "pnpm-lock.yaml",
  workspaceMarkers: ["pnpm-workspace.yaml"],
  dependencyVolumePath: "/workspace/node_modules",
};
