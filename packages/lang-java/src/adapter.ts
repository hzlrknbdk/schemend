import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { LanguageAdapter } from "@schemend/core";
import { build, test } from "./checks.js";
import {
  assertDockerVisibility,
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
  assertDockerVisibility,
  findAffected,
  build,
  test,
  dockerImage: `schemend-lang-java:3.9.9-temurin21-${DOCKERFILE_HASH}`,
  dockerfile: DOCKERFILE,
  // `dependency:go-offline` alone misses artifacts Maven only resolves once a real goal actually
  // needs them (surefire's own JUnit provider, some test-scope transitives - verified empirically,
  // see DECISIONS.md): running the project's real tests once is the only combination proven to
  // populate everything a later --network none test-compile/test will need. `failure.ignore`
  // means an actually-broken baseline doesn't crash this step with an "install failed" error - the
  // real build/test calls right after this (unaffected by it) are what determine baseline pass/fail.
  installCommand: "mvn -q -B test -Dmaven.test.failure.ignore=true",
  lockfile: "pom.xml",
  workspaceMarkers: [],
  dependencyVolumePath: "/opt/maven-repo",
};
