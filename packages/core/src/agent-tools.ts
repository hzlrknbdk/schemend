import { readFile, writeFile } from "node:fs/promises";
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
import type { CheckResult } from "./types.js";

/** MCP server name the agent's custom tools are registered under; wire names are mcp__<this>__<tool>. */
export const TOOL_SERVER_NAME = "schemend";

export const TOOL_NAMES: readonly AgentToolName[] = [
  "read_file",
  "edit_file",
  "run_build",
  "run_tests",
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

function formatCheck(result: CheckResult): string {
  return result.status === "passed"
    ? `${result.name}: passed`
    : `${result.name}: failed\n${result.detail ?? ""}`;
}

export interface AgentTools {
  server: ReturnType<typeof createSdkMcpServer>;
  /** The raw tool definitions, exposed for direct unit testing of their handlers. */
  // biome-ignore lint/suspicious/noExplicitAny: tools have different per-tool zod shapes; this list is for test access only.
  tools: SdkMcpToolDefinition<any>[];
  changedFiles: Set<string>;
}

/**
 * Builds the four tools the fix agent is allowed to use (SPEC §6): read_file/edit_file operate
 * only within ctx.root, and edit_file refuses any path outside `affectedFiles` (SPEC §2 step 5:
 * "agent edits only affected files"). run_build/run_tests call straight through to the adapter,
 * which routes execution through ctx.exec (Docker-vs-local stays in core, per AdapterContext).
 *
 * `events`, when given, lets edit_file emit a file-edited event with the actual diff - the only
 * place that has both the old and new file content in hand. The agent-tool-call/-result events
 * for all four tools come from parsing the SDK's own message stream instead (runFixAgent), since
 * that's the only place that sees the model's tool_use id.
 */
export function buildAgentTools(
  ctx: AdapterContext,
  adapter: Pick<LanguageAdapter, "build" | "test">,
  affectedFiles: readonly string[],
  events?: { api: string; onEvent?: (event: CheckEvent) => void },
): AgentTools {
  const allowed = new Set(affectedFiles);
  const changedFiles = new Set<string>();
  const emit = createEventEmitter(events?.onEvent);

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
      if (events && before !== content) {
        const { added, removed, diff } = computeDiff(relPath, before, content);
        emit({
          type: "file-edited",
          api: events.api,
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
      return {
        content: [{ type: "text" as const, text: formatCheck(result) }],
      };
    },
  );

  const runTestsTool = tool(
    "run_tests",
    "Run the consumer project's test suite and report the result.",
    {},
    async () => {
      const result = await adapter.test(ctx);
      return {
        content: [{ type: "text" as const, text: formatCheck(result) }],
      };
    },
  );

  const tools = [readFileTool, editFileTool, runBuildTool, runTestsTool];
  const server = createSdkMcpServer({ name: TOOL_SERVER_NAME, tools });

  return { server, tools, changedFiles };
}
