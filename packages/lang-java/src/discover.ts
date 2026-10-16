import { access, readdir, readFile, realpath, stat } from "node:fs/promises";
import path from "node:path";
import type { AdapterContext, ApiEntry } from "@schemend/core";
import { UnsupportedWorkspaceError } from "@schemend/core";
import { XMLParser } from "fast-xml-parser";

const SKIP_DIRS = new Set(["target", ".git"]);

const xmlParser = new XMLParser({ ignoreAttributes: true, trimValues: true });

function toArray<T>(value: T | T[] | undefined): T[] {
  if (value === undefined) return [];
  return Array.isArray(value) ? value : [value];
}

interface PomExecutionConfig {
  inputSpec?: string | number;
  apiPackage?: string | number;
}

interface PomExecution {
  configuration?: PomExecutionConfig;
}

interface PomPlugin {
  artifactId?: string;
  executions?: { execution?: PomExecution | PomExecution[] };
}

interface PomParent {
  groupId?: string;
  artifactId?: string;
  version?: string | number;
  relativePath?: string;
}

interface PomProject {
  groupId?: string;
  artifactId?: string;
  version?: string | number;
  parent?: PomParent;
  properties?: Record<string, string | number>;
  build?: { plugins?: { plugin?: PomPlugin | PomPlugin[] } };
}

/** project.basedir resolves to "." (not an absolute path) - the only shape this adapter needs out of it, same as every other ApiEntry.source.location. */
const BUILTIN_PROPERTIES: Record<string, string> = { "project.basedir": "." };

function readProperties(project: PomProject): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(project.properties ?? {})) {
    result[key] = String(value);
  }
  if (project.groupId !== undefined)
    result["project.groupId"] = project.groupId;
  if (project.artifactId !== undefined)
    result["project.artifactId"] = project.artifactId;
  if (project.version !== undefined)
    result["project.version"] = String(project.version);
  return result;
}

/** Resolves a pom.xml value's `${...}` tokens against <properties> - real poms write `<inputSpec>${orders.openapi.spec}</inputSpec>`, never a literal path. Iterates since one property can reference another. */
function resolveMavenProperties(
  value: string,
  properties: Record<string, string>,
): string {
  let resolved = value;
  for (let i = 0; i < 5; i++) {
    const next = resolved.replace(/\$\{([\w.]+)\}/g, (match, key: string) => {
      return properties[key] ?? BUILTIN_PROPERTIES[key] ?? match;
    });
    if (next === resolved) break;
    resolved = next;
  }
  return resolved;
}

async function readPom(pomPath: string): Promise<PomProject | undefined> {
  const raw = await readFile(pomPath, "utf-8").catch(() => undefined);
  if (raw === undefined) return undefined;
  const parsed = xmlParser.parse(raw) as { project?: PomProject };
  return parsed.project;
}

const OPENAPI_GENERATOR_ARTIFACT_ID = "openapi-generator-maven-plugin";

interface OpenApiGeneratorConfig {
  inputSpec: string;
  apiPackage?: string;
}

/** Only looks at <build><plugins> directly on the pom.xml - <pluginManagement>/<profiles> aren't recognized (v1.1 note, see DECISIONS.md). */
function findOpenApiGeneratorConfig(
  project: PomProject,
): OpenApiGeneratorConfig | undefined {
  const plugin = toArray(project.build?.plugins?.plugin).find(
    (candidate) => candidate.artifactId === OPENAPI_GENERATOR_ARTIFACT_ID,
  );
  if (!plugin) return undefined;

  const properties = readProperties(project);

  for (const execution of toArray(plugin.executions?.execution)) {
    const rawInputSpec = execution.configuration?.inputSpec;
    if (rawInputSpec === undefined) continue;
    const inputSpec = path.normalize(
      resolveMavenProperties(String(rawInputSpec), properties),
    );

    const rawApiPackage = execution.configuration?.apiPackage;
    const apiPackage =
      rawApiPackage !== undefined
        ? resolveMavenProperties(String(rawApiPackage), properties)
        : undefined;

    return { inputSpec, ...(apiPackage !== undefined ? { apiPackage } : {}) };
  }
  return undefined;
}

/** Throws if pom.xml's <parent> resolves to a local file with a matching groupId/artifactId/version - a real Maven reactor relationship, unsupported in v1 (SPEC §4). An explicit empty <relativePath/> (e.g. spring-boot-starter-parent) always means "resolve from the repository", never a reactor. */
export async function assertNotMultiModule(root: string): Promise<void> {
  const project = await readPom(path.join(root, "pom.xml"));
  const parent = project?.parent;
  if (!parent?.groupId || !parent.artifactId || !parent.version) return;
  if (parent.relativePath === "") return;

  const relativePath = parent.relativePath ?? "../pom.xml";
  const parentPomPath = path.resolve(root, relativePath);
  const parentProject = await readPom(parentPomPath);
  if (!parentProject) return;

  const matches =
    parentProject.groupId === parent.groupId &&
    parentProject.artifactId === parent.artifactId &&
    parentProject.version === parent.version;
  if (!matches) return;

  throw new UnsupportedWorkspaceError(
    `${root}/pom.xml declares <parent> ${parent.groupId}:${parent.artifactId}:${parent.version} ` +
      `resolving to a local file (${relativePath}) with a matching groupId/artifactId/version - ` +
      "this is a Maven multi-module reactor, which schemend v1 doesn't support (SPEC §4; see " +
      "PLAN.md v1.1). Only a standalone Maven module (no local reactor parent) is supported.",
  );
}

// A single slash, not `://`: config.inputSpec has already been through findOpenApiGeneratorConfig's
// own path.normalize(), which collapses "https://host" down to "https:/host".
const URL_SCHEME_RE = /^[a-z][a-z0-9+.-]*:\//i;

/** Validates that pom.xml's inputSpec is a real local file safely inside `repoRoot`, the boundary install (unlike build/test) mounts with network access. A URL, missing file, or symlink escape is refused with a clear error. */
export async function assertDockerVisibility(
  root: string,
  repoRoot: string,
): Promise<void> {
  const project = await readPom(path.join(root, "pom.xml"));
  const config = project && findOpenApiGeneratorConfig(project);
  if (!config) return;

  if (URL_SCHEME_RE.test(config.inputSpec)) {
    throw new Error(
      `${root}/pom.xml's openapi-generator inputSpec ("${config.inputSpec}") is a URL, not a ` +
        "local file - schemend can't validate or mount a remote schema for Docker-based install.",
    );
  }

  const declaredPath = path.resolve(root, config.inputSpec);
  let resolvedPath: string;
  try {
    resolvedPath = await realpath(declaredPath);
  } catch (error) {
    throw new Error(
      `${root}/pom.xml's openapi-generator inputSpec resolves to "${declaredPath}", which ` +
        `doesn't exist: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  // Both sides go through realpath before comparing: repoRoot itself may sit behind a symlink
  // (e.g. a tmpdir), and comparing an un-resolved repoRoot against a resolved resolvedPath could
  // spuriously flag a legitimate in-repo file as "outside" (or the reverse).
  const realRepoRoot = await realpath(repoRoot);
  const relFromRepoRoot = path.relative(realRepoRoot, resolvedPath);
  if (relFromRepoRoot.startsWith("..") || path.isAbsolute(relFromRepoRoot)) {
    throw new Error(
      `${root}/pom.xml's openapi-generator inputSpec resolves to "${resolvedPath}", outside the ` +
        `repo root ("${repoRoot}") Docker mounts for install - refusing to proceed.`,
    );
  }

  const stats = await stat(resolvedPath);
  if (!stats.isFile()) {
    throw new Error(
      `${root}/pom.xml's openapi-generator inputSpec resolves to "${resolvedPath}", which isn't a regular file.`,
    );
  }
}

export async function detect(root: string): Promise<boolean> {
  try {
    await access(path.join(root, "pom.xml"));
    return true;
  } catch {
    return false;
  }
}

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

const ENV_API_URL_JAVA_RE = /System\.getenv\(\s*"([A-Z0-9_]+_API_URL)"\s*\)/g;
const ENV_API_URL_PLACEHOLDER_RE = /\$\{([A-Z0-9_]+_API_URL)(?::[^}]*)?\}/g;

function isApplicationConfigFile(fileName: string): boolean {
  return /^application(-\w+)?\.(ya?ml|properties)$/.test(fileName);
}

/** The ORDERS_API_URL-style reference usually lives in application.yml/.properties (Spring placeholders), not a .java file calling System.getenv directly. */
function collectEvidence(
  apiNameUpper: string,
  relFile: string,
  content: string,
  isJava: boolean,
): string[] {
  const evidence: string[] = [];
  const re = isJava ? ENV_API_URL_JAVA_RE : ENV_API_URL_PLACEHOLDER_RE;
  for (const match of content.matchAll(re)) {
    const envVar = match[1];
    if (envVar?.startsWith(apiNameUpper)) {
      evidence.push(`env ${envVar} in ${relFile}`);
    }
  }
  return evidence;
}

/** Finds APIs a Java project calls (SPEC §2 step 1): pom.xml's generator execution gives name + schema; `.java` files importing its apiPackage give a rough `usedIn` (real impact analysis is findAffected). */
export async function discoverApis(ctx: AdapterContext): Promise<ApiEntry[]> {
  await assertNotMultiModule(ctx.root);

  const project = await readPom(path.join(ctx.root, "pom.xml"));
  if (!project) return [];
  const config = findOpenApiGeneratorConfig(project);
  if (!config) return [];

  const name = path.basename(path.dirname(config.inputSpec));
  const apiNameUpper = name.toUpperCase();
  const files = await listFiles(ctx.root);

  const usedInDirs = new Set<string>();
  const evidence = ["pom.xml openapi-generator-maven-plugin execution"];

  for (const file of files) {
    const isJava = file.endsWith(".java");
    const isAppConfig = isApplicationConfigFile(path.basename(file));
    if (!isJava && !isAppConfig) continue;

    const relFile = path.relative(ctx.root, file);
    const content = await readFile(file, "utf-8");

    if (isJava && config.apiPackage && content.includes(config.apiPackage)) {
      usedInDirs.add(path.dirname(relFile));
    }

    evidence.push(...collectEvidence(apiNameUpper, relFile, content, isJava));
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

/** Re-runs the generator execution that produces `api`'s client (SPEC §2 step 4), after verifying pom.xml's inputSpec still matches `api.source.location`. */
export async function regenerateClient(
  ctx: AdapterContext,
  api: ApiEntry,
): Promise<void> {
  if (api.source.type !== "openapi") return;

  const project = await readPom(path.join(ctx.root, "pom.xml"));
  const config = project && findOpenApiGeneratorConfig(project);
  if (!config || config.inputSpec !== api.source.location) {
    throw new Error(
      `no openapi-generator-maven-plugin execution found for schema "${api.source.location}" in ${ctx.root}/pom.xml`,
    );
  }

  const result = await ctx.exec("mvn -q -B generate-sources");
  if (result.exitCode !== 0) {
    throw new Error(
      `regenerating client for "${api.name}" failed (exit ${result.exitCode}): ${result.stderr || result.stdout}`,
    );
  }
}
