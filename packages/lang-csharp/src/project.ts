import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { XMLParser } from "fast-xml-parser";

const SKIP_DIRS = new Set(["bin", "obj", ".git", "node_modules"]);

const xmlParser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  trimValues: true,
});

function toArray<T>(value: T | T[] | undefined): T[] {
  if (value === undefined) return [];
  return Array.isArray(value) ? value : [value];
}

interface RawPackageReference {
  "@_Include"?: string;
}

interface RawItemGroup {
  PackageReference?: RawPackageReference | RawPackageReference[];
}

interface RawExec {
  "@_Command"?: string;
}

interface RawTarget {
  "@_Name"?: string;
  Exec?: RawExec | RawExec[];
}

interface RawProject {
  ItemGroup?: RawItemGroup | RawItemGroup[];
  Target?: RawTarget | RawTarget[];
  PropertyGroup?: Record<string, unknown> | Record<string, unknown>[];
}

export interface NSwagConfig {
  targetName: string;
  /**
   * Root-relative (not project-relative) and already resolved through $(Prop) tokens - see
   * resolveMsBuildProperties. The raw attribute value is relative to the .csproj's own
   * directory, which may be nested under `root` (see src/+tests/ layouts like
   * services/notification), so this has already been re-expressed relative to `root` once, the
   * same shape every other ApiEntry.source.location already has.
   */
  inputSpec: string;
  namespace?: string;
  /** True if `inputSpec` still contains an unresolved $(...) token after resolution. */
  unresolvedInputSpec: boolean;
}

export interface CsProjectInfo {
  /** Root-relative path to the .csproj file. */
  path: string;
  isTestProject: boolean;
  nswag?: NSwagConfig;
}

async function listCsprojFiles(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    if (SKIP_DIRS.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await listCsprojFiles(full)));
      continue;
    }
    if (entry.name.endsWith(".csproj")) files.push(full);
  }
  return files;
}

/** MSBuild built-ins resolved even with no local <PropertyGroup> entry - only the ones schemend's fixtures exercise; an unrecognized one is left unresolved (see NSwagConfig.unresolvedInputSpec). */
const MSBUILD_BUILTIN_PROPERTIES: Record<string, string> = {
  MSBuildProjectDirectory: ".",
};

/** Resolves `$(Prop)` tokens against every <PropertyGroup> in the file (ignoring Condition - v1 simplicity scope). Iterates a few passes; an unmatched token is left as-is, never guessed at. */
function resolveMsBuildProperties(
  value: string,
  properties: Record<string, string>,
): string {
  let resolved = value;
  for (let i = 0; i < 5; i++) {
    const next = resolved.replace(/\$\(([\w.]+)\)/g, (match, key: string) => {
      return properties[key] ?? MSBUILD_BUILTIN_PROPERTIES[key] ?? match;
    });
    if (next === resolved) break;
    resolved = next;
  }
  return resolved;
}

function collectProperties(project: RawProject): Record<string, string> {
  const result: Record<string, string> = {};
  for (const group of toArray(project.PropertyGroup)) {
    for (const [key, value] of Object.entries(group)) {
      if (key.startsWith("@_") || typeof value === "object") continue;
      result[key] = String(value);
    }
  }
  return result;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** A single slash, not `://`, so it also matches an inputSpec already collapsed by path.normalize() elsewhere (see discover.ts's use of this for the final, root-relative value). */
export const URL_SCHEME_RE = /^[a-z][a-z0-9+.-]*:\//i;

/** Extracts e.g. `/input:../orders/openapi.json` or a quoted `/input:"../orders/openapi.json"` from a raw Exec Command string. */
function extractExecArg(command: string, flag: string): string | undefined {
  const re = new RegExp(`${escapeRegExp(flag)}:("([^"]*)"|(\\S+))`);
  const match = command.match(re);
  if (!match) return undefined;
  return match[2] ?? match[3];
}

async function readCsproj(csprojPath: string): Promise<RawProject | undefined> {
  const raw = await readFile(csprojPath, "utf-8").catch(() => undefined);
  if (raw === undefined) return undefined;
  const parsed = xmlParser.parse(raw) as { Project?: RawProject };
  return parsed.Project;
}

/** Finds the `<Target><Exec Command="... openapi2csclient ...">` NSwag uses to generate a client - only the first such Exec in any Target is recognized (C#'s equivalent of Java's single-execution scope limit). */
function findNSwagConfig(
  project: RawProject,
  root: string,
  projectDir: string,
): NSwagConfig | undefined {
  const properties = collectProperties(project);

  for (const target of toArray(project.Target)) {
    for (const exec of toArray(target.Exec)) {
      const command = exec["@_Command"];
      if (!command?.includes("openapi2csclient")) continue;

      const rawInput = extractExecArg(command, "/input");
      if (!rawInput) continue;

      const resolvedInput = resolveMsBuildProperties(rawInput, properties);
      const unresolvedInputSpec = resolvedInput.includes("$(");
      // A URL is kept as-is, never joined/re-relativized against root - that would mangle it
      // into something like "src/Notification/https:/host/..." that no longer reads as a URL.
      const inputSpec = URL_SCHEME_RE.test(resolvedInput)
        ? resolvedInput
        : path.normalize(
            path.relative(root, path.resolve(projectDir, resolvedInput)),
          );

      const rawNamespace = extractExecArg(command, "/namespace");
      const namespace =
        rawNamespace !== undefined
          ? resolveMsBuildProperties(rawNamespace, properties)
          : undefined;

      return {
        targetName: target["@_Name"] ?? "",
        inputSpec,
        unresolvedInputSpec,
        ...(namespace !== undefined ? { namespace } : {}),
      };
    }
  }
  return undefined;
}

async function parseCsProjectInfo(
  root: string,
  csprojPath: string,
): Promise<CsProjectInfo> {
  const project = (await readCsproj(csprojPath)) ?? {};
  const packageReferences = new Set(
    toArray(project.ItemGroup)
      .flatMap((group) => toArray(group.PackageReference))
      .map((ref) => ref["@_Include"])
      .filter((id): id is string => Boolean(id)),
  );

  return {
    path: path.relative(root, csprojPath),
    isTestProject: packageReferences.has("Microsoft.NET.Test.Sdk"),
    ...((): Pick<CsProjectInfo, "nswag"> | object => {
      const nswag = findNSwagConfig(project, root, path.dirname(csprojPath));
      return nswag !== undefined ? { nswag } : {};
    })(),
  };
}

/** Every .csproj under `root` (bin/obj/.git skipped), parsed for its NSwag config + test-project classification. */
export async function findCsProjects(root: string): Promise<CsProjectInfo[]> {
  const csprojPaths = await listCsprojFiles(root);
  return Promise.all(csprojPaths.map((p) => parseCsProjectInfo(root, p)));
}

async function findSolutionFile(root: string): Promise<string | undefined> {
  const entries = await readdir(root, { withFileTypes: true }).catch(() => []);
  const solutions = entries
    .filter(
      (entry) =>
        entry.isFile() &&
        (entry.name.endsWith(".sln") || entry.name.endsWith(".slnx")),
    )
    .map((entry) => entry.name);
  if (solutions.length > 1) {
    throw new Error(
      `multiple solution files found directly at ${root} (${solutions.join(", ")}) - schemend can't tell which one to build/test.`,
    );
  }
  return solutions[0];
}

export interface BuildTarget {
  /** Root-relative path to pass to `dotnet build`/`test`/`restore`: a .sln/.slnx if one sits directly at root, else the test project (so building it also compiles the main project via ProjectReference), else the main project alone. */
  commandPath: string;
  mainProject: CsProjectInfo;
}

/** Picks the single NSwag-bearing project and the right build/test/restore target (SPEC §4, see DECISIONS.md). Throws rather than guessing on ambiguity (multiple NSwag or, with no .sln, multiple test projects). */
export async function resolveBuildTarget(root: string): Promise<BuildTarget> {
  const projects = await findCsProjects(root);
  const mainCandidates = projects.filter((p) => p.nswag !== undefined);

  if (mainCandidates.length === 0) {
    throw new Error(
      `no NSwag openapi2csclient Exec target found in any .csproj under ${root}.`,
    );
  }
  const mainProject = mainCandidates[0];
  if (mainCandidates.length > 1 || !mainProject) {
    throw new Error(
      `multiple .csproj files under ${root} declare an NSwag openapi2csclient Exec target ` +
        `(${mainCandidates.map((p) => p.path).join(", ")}) - schemend can't tell which one is ` +
        "this consumer's API client.",
    );
  }

  const solution = await findSolutionFile(root);
  if (solution) return { commandPath: solution, mainProject };

  const testCandidates = projects.filter((p) => p.isTestProject);
  if (testCandidates.length > 1) {
    throw new Error(
      `multiple test projects found under ${root} (${testCandidates.map((p) => p.path).join(", ")}) ` +
        "and no .sln/.slnx to disambiguate - schemend can't tell which one to run.",
    );
  }

  return {
    commandPath: testCandidates[0]?.path ?? mainProject.path,
    mainProject,
  };
}

/** Throws a clear error for a missing or not-yet-fully-resolved NSwag config, instead of letting callers act on bad data (SPEC §1: never invent). */
export function requireResolvedNSwagConfig(
  project: CsProjectInfo,
): NSwagConfig {
  if (!project.nswag) {
    throw new Error(
      `${project.path} has no NSwag openapi2csclient Exec target.`,
    );
  }
  if (project.nswag.unresolvedInputSpec) {
    throw new Error(
      `${project.path}'s NSwag openapi2csclient /input value resolved to "${project.nswag.inputSpec}", ` +
        "which still contains an unresolved $(...) MSBuild property - schemend only resolves " +
        "properties declared directly in a <PropertyGroup> in the same file.",
    );
  }
  return project.nswag;
}

export async function detect(root: string): Promise<boolean> {
  try {
    const projects = await findCsProjects(root);
    return projects.some((p) => p.nswag !== undefined);
  } catch {
    return false;
  }
}
