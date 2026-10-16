import path from "node:path";
import type {
  AdapterContext,
  AffectedLocation,
  ApiChange,
  ApiEntry,
} from "@schemend/core";
import { Project } from "ts-morph";

/**
 * oasdiff quotes the affected field/parameter name in backticks, e.g. "removed the required
 * property `items/totalPrice` from the response". Nested fields are given as a path
 * (`items/totalPrice`); only the last segment is the actual property name tsc diagnostics use.
 */
function identifiersIn(change: ApiChange): string[] {
  return [...change.summary.matchAll(/`([^`]+)`/g)]
    .map((match) => match[1]?.split("/").pop())
    .filter((id): id is string => Boolean(id));
}

/** Matches the quotes tsc itself uses ('totalPrice'), not just a bare substring - avoids a short identifier like `total` spuriously matching inside `totalPrice`. */
function matchChange(
  text: string,
  changes: ApiChange[],
): ApiChange | undefined {
  return changes.find((change) =>
    identifiersIn(change).some((id) => text.includes(`'${id}'`)),
  );
}

/** Locates code affected by a schema change (SPEC §2 step 4) via ts-morph's tsc diagnostics across the whole project, not just api.usedIn (a rough hint that misses indirect type reaches). An unmatched diagnostic is dropped, never guessed at. */
export async function findAffected(
  ctx: AdapterContext,
  _api: ApiEntry,
  changes: ApiChange[],
): Promise<AffectedLocation[]> {
  const project = new Project({
    tsConfigFilePath: path.join(ctx.root, "tsconfig.json"),
  });

  const locations: AffectedLocation[] = [];
  for (const diagnostic of project.getPreEmitDiagnostics()) {
    const sourceFile = diagnostic.getSourceFile();
    if (!sourceFile) continue;

    const filePath = sourceFile.getFilePath();

    const messageText = diagnostic.getMessageText();
    const text =
      typeof messageText === "string"
        ? messageText
        : messageText.getMessageText();
    const match = matchChange(text, changes);
    if (!match) continue;

    const start = diagnostic.getStart();
    const line =
      start === undefined ? 0 : sourceFile.getLineAndColumnAtPos(start).line;
    const snippet =
      sourceFile.getFullText().split("\n")[line - 1]?.trim() ?? "";

    locations.push({
      file: path.relative(ctx.root, filePath),
      line,
      changeId: match.id,
      snippet,
    });
  }

  return locations;
}
