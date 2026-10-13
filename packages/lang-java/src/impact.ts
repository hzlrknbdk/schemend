import { readFile } from "node:fs/promises";
import path from "node:path";
import type {
  AdapterContext,
  AffectedLocation,
  ApiChange,
  ApiEntry,
} from "@schemend/core";

interface JavacDiagnostic {
  file: string;
  line: number;
  message: string;
}

// `[ERROR] <path>.java:[line,col] <message>`, the only two forms javac's own continuation lines
// ("symbol:"/"location:") show up in - unprefixed under the mid-build "COMPILATION ERROR" banner,
// `[ERROR]`-prefixed in the end-of-build "Failed to execute goal" summary - captured from a real
// `mvn -q test-compile` run (see src/fixtures/mvn-test-compile-*.txt), not guessed.
const ERROR_LINE_RE = /^\[ERROR\] (.+\.java):\[(\d+),\d+\] (.*)$/;
const CONTINUATION_RE = /^(?:\[ERROR\])? {2,}(symbol|location): *(.*)$/;

/**
 * Both the mid-build and end-of-build occurrences of the same error parse to the same
 * file+line key, so this only keeps the first text seen per key.
 */
function parseJavacDiagnostics(output: string): JavacDiagnostic[] {
  const lines = output.split("\n");
  const byKey = new Map<string, JavacDiagnostic>();

  for (let i = 0; i < lines.length; i++) {
    const match = lines[i]?.match(ERROR_LINE_RE);
    if (!match) continue;
    const [, file, lineStr, firstMessage] = match;
    if (!file || !lineStr) continue;

    const key = `${file}:${lineStr}`;
    if (byKey.has(key)) continue;

    const parts = [firstMessage ?? ""];
    for (let j = i + 1; j < lines.length; j++) {
      const continuation = lines[j]?.match(CONTINUATION_RE);
      if (!continuation) break;
      parts.push(`${continuation[1]}: ${continuation[2]}`);
    }
    byKey.set(key, { file, line: Number(lineStr), message: parts.join(" ") });
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
 * javac's "cannot find symbol" names the missing JavaBean accessor method (e.g.
 * "getTotalPrice"), not the raw field name oasdiff quotes ("totalPrice") - a removed/renamed
 * property almost always breaks as a missing get/set/is method, not a missing bare field.
 */
function javaAccessorVariants(id: string): string[] {
  const capitalized = id.charAt(0).toUpperCase() + id.slice(1);
  return [id, `get${capitalized}`, `set${capitalized}`, `is${capitalized}`];
}

function matchChange(
  text: string,
  changes: ApiChange[],
): ApiChange | undefined {
  return changes.find((change) =>
    identifiersIn(change).some((id) =>
      javaAccessorVariants(id).some((variant) =>
        new RegExp(`\\b${escapeRegExp(variant)}\\b`).test(text),
      ),
    ),
  );
}

/**
 * Locates code affected by a schema change (SPEC §2 step 4). Runs `mvn test-compile` - not just
 * `compile` - so a schema change that breaks a test fixture is caught too, the same project-wide
 * reach TypeScript's ts-morph scan already has. Unlike ts-morph, Maven's lifecycle means a main-
 * code failure stops before test-compile even runs, so this single call can still miss a
 * test-only error that only becomes visible once the main code is fixed - that gap is closed by
 * agent-tools.ts re-running this same function from run_build, not by anything here (see
 * DECISIONS.md).
 */
export async function findAffected(
  ctx: AdapterContext,
  _api: ApiEntry,
  changes: ApiChange[],
): Promise<AffectedLocation[]> {
  const result = await ctx.exec("mvn -q -B test-compile");
  const diagnostics = parseJavacDiagnostics(
    `${result.stdout}\n${result.stderr}`,
  );

  const locations: AffectedLocation[] = [];
  for (const diagnostic of diagnostics) {
    const match = matchChange(diagnostic.message, changes);
    if (!match) continue;

    const sourceText = await readFile(diagnostic.file, "utf-8").catch(() => "");
    const snippet = sourceText.split("\n")[diagnostic.line - 1]?.trim() ?? "";

    locations.push({
      file: path.relative(ctx.root, diagnostic.file),
      line: diagnostic.line,
      changeId: match.id,
      snippet,
    });
  }
  return locations;
}
