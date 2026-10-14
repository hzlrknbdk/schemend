import { readdir, readFile, realpath, stat } from "node:fs/promises";
import path from "node:path";
import type { AdapterContext, ApiEntry } from "@schemend/core";
import {
  requireResolvedNSwagConfig,
  resolveBuildTarget,
  URL_SCHEME_RE,
} from "./project.js";

const SKIP_DIRS = new Set(["bin", "obj", ".git", "node_modules"]);

async function listFiles(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    if (SKIP_DIRS.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await listFiles(full)));
      continue;
    }
    files.push(full);
  }
  return files;
}

const ENV_API_URL_RE =
  /Environment\.GetEnvironmentVariable\(\s*"([A-Z0-9_]+_API_URL)"\s*\)/g;

/**
 * Finds APIs a C# project calls (SPEC §2 step 1): an NSwag openapi2csclient Exec target gives the
 * API name and schema location; `.cs` files referencing the generated client's namespace give a
 * rough `usedIn` (same "rough hint" caveat as TypeScript/Java's - real impact analysis is
 * findAffected's compiler scan, not this list).
 */
export async function discoverApis(ctx: AdapterContext): Promise<ApiEntry[]> {
  const target = await resolveBuildTarget(ctx.root);
  const config = requireResolvedNSwagConfig(target.mainProject);

  const name = path.basename(path.dirname(config.inputSpec));
  const apiNameUpper = name.toUpperCase();
  const files = await listFiles(ctx.root);

  const usedInDirs = new Set<string>();
  const evidence = [
    `${target.mainProject.path} NSwag openapi2csclient Exec target`,
  ];

  for (const file of files) {
    if (!file.endsWith(".cs")) continue;
    const relFile = path.relative(ctx.root, file);
    const content = await readFile(file, "utf-8");

    if (config.namespace && content.includes(config.namespace)) {
      usedInDirs.add(path.dirname(relFile));
    }

    for (const match of content.matchAll(ENV_API_URL_RE)) {
      const envVar = match[1];
      if (envVar?.startsWith(apiNameUpper)) {
        evidence.push(`env ${envVar} in ${relFile}`);
      }
    }
  }

  return [
    {
      name,
      kind: "internal",
      source: { type: "openapi", location: config.inputSpec },
      usedIn: [...usedInDirs].sort(),
      evidence,
    },
  ];
}

/**
 * Re-runs just the NSwag openapi2csclient Target that generates `api`'s client (SPEC §2 step 4),
 * via `-t:<targetName>` rather than a full build - the C# equivalent of Maven's dedicated
 * `generate-sources` phase. Verifies the main project's own NSwag config still matches
 * `api.source.location` first, same defensive check as TypeScript/Java's regenerateClient.
 */
export async function regenerateClient(
  ctx: AdapterContext,
  api: ApiEntry,
): Promise<void> {
  if (api.source.type !== "openapi") return;

  const target = await resolveBuildTarget(ctx.root);
  const config = requireResolvedNSwagConfig(target.mainProject);
  if (config.inputSpec !== api.source.location) {
    throw new Error(
      `no NSwag openapi2csclient Exec target found for schema "${api.source.location}" in ${ctx.root}`,
    );
  }

  const result = await ctx.exec(
    `dotnet build ${target.mainProject.path} --no-restore -t:${config.targetName}`,
  );
  if (result.exitCode !== 0) {
    throw new Error(
      `regenerating client for "${api.name}" failed (exit ${result.exitCode}): ${result.stderr || result.stdout}`,
    );
  }
}

/**
 * Validates that the main project's configured schema (inputSpec) is a real local file safely
 * inside `repoRoot` - the boundary ensureDockerCtx actually mounts for install, which (unlike
 * build/test) runs with network access (see DECISIONS.md). A .csproj is repo content, not
 * something to trust blindly when deciding what a networked container can reach.
 */
export async function assertDockerVisibility(
  root: string,
  repoRoot: string,
): Promise<void> {
  const target = await resolveBuildTarget(root);
  const config = requireResolvedNSwagConfig(target.mainProject);

  if (URL_SCHEME_RE.test(config.inputSpec)) {
    throw new Error(
      `${target.mainProject.path}'s NSwag openapi2csclient inputSpec ("${config.inputSpec}") is a ` +
        "URL, not a local file - schemend can't validate or mount a remote schema for Docker-based install.",
    );
  }

  const declaredPath = path.resolve(root, config.inputSpec);
  let resolvedPath: string;
  try {
    resolvedPath = await realpath(declaredPath);
  } catch (error) {
    throw new Error(
      `${target.mainProject.path}'s NSwag openapi2csclient inputSpec resolves to "${declaredPath}", ` +
        `which doesn't exist: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  const realRepoRoot = await realpath(repoRoot);
  const relFromRepoRoot = path.relative(realRepoRoot, resolvedPath);
  if (relFromRepoRoot.startsWith("..") || path.isAbsolute(relFromRepoRoot)) {
    throw new Error(
      `${target.mainProject.path}'s NSwag openapi2csclient inputSpec resolves to "${resolvedPath}", ` +
        `outside the repo root ("${repoRoot}") Docker mounts for install - refusing to proceed.`,
    );
  }

  const stats = await stat(resolvedPath);
  if (!stats.isFile()) {
    throw new Error(
      `${target.mainProject.path}'s NSwag openapi2csclient inputSpec resolves to "${resolvedPath}", ` +
        "which isn't a regular file.",
    );
  }
}
