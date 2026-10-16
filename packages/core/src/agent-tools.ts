import { readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  createSdkMcpServer,
  type SdkMcpToolDefinition,
  tool,
} from "@anthropic-ai/claude-agent-sdk";
import { createPatch, diffLines } from "diff";
import { z } from "zod";
import type { AdapterContext } from "./context.js";
import {
  type AgentToolName,
  type CheckEvent,
  createEventEmitter,
} from "./events.js";
import type { LanguageAdapter } from "./language-adapter.js";
import type { ApiChange, ApiEntry, CheckResult, ReviewItem } from "./types.js";

/** True if `relPath`, resolved against `root`, never escapes it - defends against a buggy adapter's findAffected returning a path outside the consumer's directory. */
function isWithinRoot(root: string, relPath: string): boolean {
  if (path.isAbsolute(relPath)) return false;
  const rel = path.relative(root, path.resolve(root, relPath));
  return rel === "" || (!rel.startsWith("..") && !path.isAbsolute(rel));
}

/** MCP server name the agent's custom tools are registered under; wire names are mcp__<this>__<tool>. */
export const TOOL_SERVER_NAME = "schemend";

export const TOOL_NAMES: readonly AgentToolName[] = [
  "read_file",
  "edit_file",
  "run_build",
  "run_tests",
  "flag",
];

export function qualifiedToolName(name: AgentToolName): string {
  return `mcp__${TOOL_SERVER_NAME}__${name}`;
}

const QUALIFIED_TO_SHORT = new Map<string, AgentToolName>(
  TOOL_NAMES.map((name) => [qualifiedToolName(name), name]),
);

export function shortToolName(
  qualifiedName: string,
): AgentToolName | undefined {
  return QUALIFIED_TO_SHORT.get(qualifiedName);
}

function computeDiff(
  file: string,
  before: string,
  after: string,
): { added: number; removed: number; diff: string } {
  let added = 0;
  let removed = 0;
  for (const change of diffLines(before, after)) {
    if (change.added) added += change.count ?? 0;
    else if (change.removed) removed += change.count ?? 0;
  }
  return { added, removed, diff: createPatch(file, before, after) };
}

/** `summary` is encoded as a trailing `[[schemend:summary]]` line agent.ts re-parses. `newlyAllowedFiles` is also spelled out in plain language above it - that part is for the model, so it knows `allowed` just grew. */
function formatCheck(
  result: CheckResult,
  summary: Record<string, unknown>,
  newlyAllowedFiles: readonly string[] = [],
): string {
  if (result.status === "passed") return `${result.name}: passed`;
  const lines = [`${result.name}: failed`, result.detail ?? ""];
  if (newlyAllowedFiles.length > 0) {
    lines.push(
      "",
      `You may now also edit: ${newlyAllowedFiles.join(", ")} - newly discovered by ` +
        "this build, previously invisible until the main code compiled.",
    );
  }
  lines.push("", `[[schemend:summary]]${JSON.stringify(summary)}`);
  return lines.join("\n");
}

export interface AgentTools {
  server: ReturnType<typeof createSdkMcpServer>;
  // biome-ignore lint/suspicious/noExplicitAny: tools have different per-tool zod shapes; this list is for test access only.
  tools: SdkMcpToolDefinition<any>[];
  changedFiles: Set<string>;
  flags: ReviewItem[];
}

/**
 * Builds the five tools the fix agent is allowed to use (SPEC §6): read_file/edit_file operate
 * only within ctx.root, and edit_file refuses any path outside `allowed` (SPEC §2 step 5).
 *
 * `allowed` grows during the session: a Maven/dotnet-style two-phase build can't surface a test
 * file's error until the main code compiles, so the first findAffected call can miss it entirely
 * (TypeScript's ts-morph diagnoses everything in one pass, so this is a no-op there). On a
 * run_build failure, this re-runs findAffected and adds any newly-reported, in-root file.
 *
 * `onEvent`, when given, lets edit_file emit a file-edited event with the diff - the only place
 * with both old and new content. agent-tool-call/-result for all five tools instead come from
 * parsing the SDK's own message stream (runFixAgent), the only place that sees the tool_use id.
 *
 * `flag` is unrelated to `allowed` - it reports a behavioral concern (SPEC §1) rather than editing
 * anything, so it may name any file under ctx.root, changed or not. Results land in `flags`, which
 * runFixAgent merges into the returned `review` (deduped) on every exit path, not just this one.
 */
export function buildAgentTools(
  ctx: AdapterContext,
  adapter: Pick<
    LanguageAdapter,
    | "build"
    | "test"
    | "findAffected"
    | "summarizeBuildFailure"
    | "summarizeTestResult"
  >,
  affectedFiles: readonly string[],
  api: ApiEntry,
  changes: ApiChange[],
  onEvent?: (event: CheckEvent) => void,
): AgentTools {
  const allowed = new Set(affectedFiles);
  const changedFiles = new Set<string>();
  const flags: ReviewItem[] = [];
  const emit = createEventEmitter(onEvent);

  const readFileTool = tool(
    "read_file",
    "Read a file's contents. Path is relative to the consumer project root.",
    { path: z.string() },
    async ({ path: relPath }) => {
      try {
        const content = await readFile(path.join(ctx.root, relPath), "utf-8");
        return { content: [{ type: "text" as const, text: content }] };
      } catch (error) {
        return {
          content: [
            {
              type: "text" as const,
              text: `could not read ${relPath}: ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
          isError: true,
        };
      }
    },
  );

  const editFileTool = tool(
    "edit_file",
    "Overwrite a file's full contents. Only files already listed as affected may be edited.",
    { path: z.string(), content: z.string() },
    async ({ path: relPath, content }) => {
      if (!allowed.has(relPath)) {
        return {
          content: [
            {
              type: "text" as const,
              text: `refused: ${relPath} is not one of the affected files (${[...allowed].join(", ")}). Only affected files may be edited.`,
            },
          ],
          isError: true,
        };
      }
      const absPath = path.join(ctx.root, relPath);
      let before = "";
      try {
        before = await readFile(absPath, "utf-8");
      } catch {
        // new file: diff against empty content
      }
      await writeFile(absPath, content, "utf-8");
      changedFiles.add(relPath);
      if (onEvent && before !== content) {
        const { added, removed, diff } = computeDiff(relPath, before, content);
        emit({
          type: "file-edited",
          api: api.name,
          file: relPath,
          added,
          removed,
          diff,
        });
      }
      return { content: [{ type: "text" as const, text: `wrote ${relPath}` }] };
    },
  );

  const runBuildTool = tool(
    "run_build",
    "Typecheck/build the consumer project and report the result.",
    {},
    async () => {
      const result = await adapter.build(ctx);
      const newlyAllowedFiles: string[] = [];
      if (result.status === "failed") {
        const newlyAffected = await adapter.findAffected(ctx, api, changes);
        for (const location of newlyAffected) {
          if (
            !allowed.has(location.file) &&
            isWithinRoot(ctx.root, location.file)
          ) {
            allowed.add(location.file);
            newlyAllowedFiles.push(location.file);
          }
        }
      }
      const summary =
        result.status === "failed"
          ? (adapter.summarizeBuildFailure?.(result) ?? {})
          : {};
      return {
        content: [
          {
            type: "text" as const,
            text: formatCheck(result, summary, newlyAllowedFiles),
          },
        ],
      };
    },
  );

  const runTestsTool = tool(
    "run_tests",
    "Run the consumer project's test suite and report the result.",
    {},
    async () => {
      const result = await adapter.test(ctx);
      const summary =
        result.status === "failed"
          ? (adapter.summarizeTestResult?.(result) ?? {})
          : {};
      return {
        content: [
          { type: "text" as const, text: formatCheck(result, summary) },
        ],
      };
    },
  );

  const flagTool = tool(
    "flag",
    "Report a behavioral concern you can't verify structurally - e.g. a currency or unit " +
      "assumption tied to a field you edited. Does not block completion; call it as many " +
      "times as needed, then keep fixing. Does not replace fixing what you can fix.",
    { file: z.string(), reason: z.string() },
    async ({ file: relPath, reason }) => {
      const trimmedReason = reason.trim();
      if (trimmedReason === "") {
        return {
          content: [
            {
              type: "text" as const,
              text: "refused: reason must not be empty.",
            },
          ],
          isError: true,
        };
      }
      if (!isWithinRoot(ctx.root, relPath)) {
        return {
          content: [
            {
              type: "text" as const,
              text: `refused: ${relPath} is outside the consumer project.`,
            },
          ],
          isError: true,
        };
      }
      try {
        await stat(path.join(ctx.root, relPath));
      } catch {
        return {
          content: [
            {
              type: "text" as const,
              text: `refused: ${relPath} does not exist.`,
            },
          ],
          isError: true,
        };
      }
      flags.push({
        file: relPath,
        reason: trimmedReason,
        source: "agent-flag",
      });
      return {
        content: [
          {
            type: "text" as const,
            text: `flagged ${relPath}: ${trimmedReason}`,
          },
        ],
      };
    },
  );

  const tools = [
    readFileTool,
    editFileTool,
    runBuildTool,
    runTestsTool,
    flagTool,
  ];
  const server = createSdkMcpServer({ name: TOOL_SERVER_NAME, tools });

  return { server, tools, changedFiles, flags };
}
