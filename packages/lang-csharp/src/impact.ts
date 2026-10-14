import { readFile } from "node:fs/promises";
import path from "node:path";
import type {
  AdapterContext,
  AffectedLocation,
  ApiChange,
  ApiEntry,
} from "@schemend/core";
import { resolveContainerPath } from "@schemend/core";
import { resolveBuildTarget } from "./project.js";

interface MsBuildDiagnostic {
  file: string;
  line: number;
  message: string;
}

// `<file>(line,col): error CSxxxx: <message> [<project path>]` - dotnet build's standard console
// format. The trailing `[<project>]` is optional in the match since it's only present on the
// inline, per-project occurrence, not the aggregated "error list" dotnet build prints again just
// before its final Build FAILED summary - both are parsed the same way, deduplicated below.
const ERROR_LINE_RE =
  /^(.+\.cs)\((\d+),\d+\): error (CS\d+): (.*?)(?: \[.*\])?$/;

/** Keeps the first occurrence per file+line+code, since dotnet build repeats every error once more in its end-of-build summary. */
function parseMsBuildDiagnostics(output: string): MsBuildDiagnostic[] {
  const byKey = new Map<string, MsBuildDiagnostic>();
  for (const line of output.split("\n")) {
    const match = line.match(ERROR_LINE_RE);
    if (!match) continue;
    const [, file, lineStr, code, message] = match;
    if (!file || !lineStr) continue;

    const key = `${file}:${lineStr}:${code}`;
    if (byKey.has(key)) continue;
    byKey.set(key, {
      file,
      line: Number(lineStr),
      message: `${code}: ${message ?? ""}`,
    });
  }
  return [...byKey.values()];
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** oasdiff quotes the affected field/parameter name in backticks; only the last path segment is the property name. */
function identifiersIn(change: ApiChange): string[] {
  return [...change.summary.matchAll(/`([^`]+)`/g)]
    .map((match) => match[1]?.split("/").pop())
    .filter((id): id is string => Boolean(id));
}

/**
 * NSwag generates PascalCase properties (e.g. `TotalPrice`) directly - no getter method the way
 * Java's accessors need - but keeps method parameters close to their original casing, so both the
 * oasdiff identifier as-is and its PascalCase form are checked.
 */
function csharpIdentifierVariants(id: string): string[] {
  const pascal = id.charAt(0).toUpperCase() + id.slice(1);
  return [id, pascal];
}

function matchChange(
  text: string,
  changes: ApiChange[],
): ApiChange | undefined {
  return changes.find((change) =>
    identifiersIn(change).some((id) =>
      csharpIdentifierVariants(id).some((variant) =>
        new RegExp(`\\b${escapeRegExp(variant)}\\b`).test(text),
      ),
    ),
  );
}

/**
 * Locates code affected by a schema change (SPEC §2 step 4). Builds the same target
 * build()/test() use (SPEC §4/§6: the test project when one exists, so its ProjectReference also
 * compiles the main project - the C# equivalent of Java's `test-compile` reach). Like Java's
 * Maven lifecycle, a main-code failure can hide a test-only error that only becomes reachable
 * once the main code compiles; that gap is closed by agent-tools.ts re-running this same function
 * from run_build, not by anything here.
 */
export async function findAffected(
  ctx: AdapterContext,
  _api: ApiEntry,
  changes: ApiChange[],
): Promise<AffectedLocation[]> {
  const target = await resolveBuildTarget(ctx.root);
  const result = await ctx.exec(
    `dotnet build ${target.commandPath} --no-restore`,
  );
  const diagnostics = parseMsBuildDiagnostics(
    `${result.stdout}\n${result.stderr}`,
  );

  const locations: AffectedLocation[] = [];
  for (const diagnostic of diagnostics) {
    const match = matchChange(diagnostic.message, changes);
    if (!match) continue;

    // dotnet build's own paths are absolute inside the container - ensureDockerCtx mounts the
    // whole repo at /workspace, so this is repoRoot-relative, not ctx.root-relative (see
    // resolveContainerPath, docker-exec.ts).
    const hostFile = resolveContainerPath(diagnostic.file, ctx.repoRoot);
    const sourceText = await readFile(hostFile, "utf-8").catch(() => "");
    const snippet = sourceText.split("\n")[diagnostic.line - 1]?.trim() ?? "";

    locations.push({
      file: path.relative(ctx.root, hostFile),
      line: diagnostic.line,
      changeId: match.id,
      snippet,
    });
  }
  return locations;
}
