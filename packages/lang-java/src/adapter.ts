import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { LanguageAdapter } from "@schemend/core";
import { build, test } from "./checks.js";
import {
  assertNotMultiModule,
  detect,
  discoverApis,
  regenerateClient,
} from "./discover.js";
import { findAffected } from "./impact.js";

// Resolves next to this module both in dev (src/adapter.ts) and in the published package
// (dist/adapter.mjs), since docker/ sits one level up from each.
const DOCKERFILE = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../docker/Dockerfile",
);

// Tags the image with the Dockerfile's own content hash, not just the maven/JDK versions it
// names: ensureDockerImage only rebuilds when the tag is unknown, so a Dockerfile edit with no
// version bump would otherwise keep reusing the stale cached image forever (same reasoning as
// the TypeScript adapter's image tag).
const DOCKERFILE_HASH = createHash("sha256")
  .update(readFileSync(DOCKERFILE))
  .digest("hex")
  .slice(0, 8);

export const javaAdapter: LanguageAdapter = {
  id: "java",
  detect,
  discoverApis,
  regenerateClient,
  assertSupportedLayout: assertNotMultiModule,
  findAffected,
  build,
  test,
  dockerImage: `schemend-lang-java:3.9.9-temurin21-${DOCKERFILE_HASH}`,
  dockerfile: DOCKERFILE,
  installCommand: "mvn -q -B dependency:go-offline",
  lockfile: "pom.xml",
  workspaceMarkers: [],
  dependencyVolumePath: "/opt/maven-repo",
};
