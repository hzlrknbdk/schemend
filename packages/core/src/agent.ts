import { AbortError, query } from "@anthropic-ai/claude-agent-sdk";
import {
  buildAgentTools,
  qualifiedToolName,
  shortToolName,
  TOOL_NAMES,
  TOOL_SERVER_NAME,
} from "./agent-tools.js";
import { type Budget, BudgetExceededError } from "./budget.js";
import type { AdapterContext } from "./context.js";
import {
  type AgentToolName,
  type CheckEvent,
  createEventEmitter,
} from "./events.js";
import type { LanguageAdapter } from "./language-adapter.js";
import type {
  AffectedLocation,
  ApiChange,
  CheckResult,
  Confidence,
  ReviewItem,
} from "./types.js";

export interface FixAgentInput {
  ctx: AdapterContext;
  adapter: Pick<LanguageAdapter, "build" | "test">;
  affected: AffectedLocation[];
  changes: ApiChange[];
  budget: Budget;
  model: string;
  api: string;
  onEvent?: (event: CheckEvent) => void;
  abortController?: AbortController;
}

export interface FixAgentOutput {
  changedFiles: string[];
  checks: CheckResult[];
  confidence: Confidence;
  costUsd: number;
  review: ReviewItem[];
}

function buildPrompt(
  changes: ApiChange[],
  affected: AffectedLocation[],
): string {
  const changeLines = changes
    .map((change) => `- [${change.id}] ${change.summary} (${change.target})`)
    .join("\n");
  const locationLines = affected
    .map(
      (location) =>
        `- ${location.file}:${location.line} (change ${location.changeId})\n    ${location.snippet}`,
    )
    .join("\n");

  return [
    "An internal API schema changed. Fix the affected code in this consumer project.",
    "",
    "API changes:",
    changeLines,
    "",
    "Affected locations:",
    locationLines,
    "",
    "Use read_file to inspect a file before editing it. Use edit_file to fix ONLY the files " +
      "listed above - do not touch any other file. After editing, call run_build and run_tests " +
      "to verify your fix; if they fail, keep fixing within the listed files until they pass or " +
      "you run out of ideas, then stop.",
  ].join("\n");
}

/**
 * Best-effort: tsc's error lines look like "foo.ts(1,2): error TS2345: ...". Returns {} (no
 * fields) for output that doesn't look like that, rather than a fabricated count - today that's
 * only a passing run, but it's also the honest fallback for a future Java/C# adapter's own build
 * tool output, which won't match this TypeScript-shaped pattern at all.
 */
function parseBuildResult(text: string): {
  errorCount?: number;
  firstError?: string;
} {
  const matches = text.match(/error TS\d+[^\n]*/g);
  if (!matches || matches.length === 0) return {};
  return { errorCount: matches.length, firstError: matches[0]?.trim() };
}

/**
 * Best-effort: matches vitest's default reporter summary line ("Tests  1 failed | 9 passed (10)")
 * and its first failing-test marker line. Returns whichever parts it recognizes; a reporter with a
 * different format just yields {}, same reasoning as parseBuildResult.
 */
function parseTestResult(text: string): {
  passed?: number;
  failed?: number;
  firstFailure?: string;
} {
  const summary = text.match(/Tests\s+(?:(\d+) failed \| )?(\d+) passed/);
  const failureLine = text.match(/^\s*(?:✗|×|FAIL)\s+.+$/m);
  return {
    ...(summary
      ? { passed: Number(summary[2]), failed: Number(summary[1] ?? 0) }
      : {}),
    ...(failureLine ? { firstFailure: failureLine[0].trim() } : {}),
  };
}

/** The tool's `input` is typed `unknown` by the SDK (zod shape isn't known at this generic point). */
function extractPath(input: unknown): string | undefined {
  if (typeof input === "object" && input !== null && "path" in input) {
    const value = (input as { path: unknown }).path;
    return typeof value === "string" ? value : undefined;
  }
  return undefined;
}

/**
 * Fix + Verify (SPEC §2 steps 5-6). Assumes the caller already ran the real pre-change baseline
 * (step 3) and the client regeneration + impact scan (step 4): by the time this runs, the
 * generated client already reflects the NEW schema, so re-checking build/test here would just
 * re-observe the breakage `affected` already describes, not a pre-existing problem - that check
 * belongs before regeneration, not here. Runs a bash-free Claude Agent SDK loop restricted to
 * read_file/edit_file/run_build/run_tests (SPEC §6), bounded by the remaining budget via the
 * SDK's own `maxBudgetUsd`. "Retry within budget" (SPEC step 6) isn't separate code here: run_build
 * and run_tests are tools the agent itself calls, so it already iterates on failures on its own.
 * Confidence and the final checks come from our own build/test run after the loop ends, not the
 * agent's self-reported tool calls - a real check is still the actual proof a fix is complete.
 *
 * Emits step-started/step-finished for its two steps ("fix": the agent loop, "verify": the final
 * build/test), agent-tool-call/agent-tool-result parsed from the SDK's own message stream
 * (tool_use blocks on assistant messages, tool_result blocks on the following user message,
 * correlated by the model's tool_use id), check-result for the final build/test, and cost-updated
 * once the SDK reports a real total_cost_usd - there's no cheaper, non-fabricated cost signal
 * available mid-loop (see DECISIONS.md: no hand-maintained pricing table).
 *
 * `abortController`, when aborted (SPEC §9's "q" shortcut), stops the SDK's query() loop; the
 * resulting AbortError is treated as a clean stop (review notes "cancelled", confidence
 * "unverified"), not a crash, and the final build/test ("verify") is skipped entirely - a
 * cancelled run shouldn't keep running more commands after the user asked it to stop.
 */
export async function runFixAgent(
  input: FixAgentInput,
): Promise<FixAgentOutput> {
  const { ctx, adapter, affected, changes, budget, model, api } = input;
  const emit = createEventEmitter(input.onEvent);

  const fixStartedAt = Date.now();
  emit({ type: "step-started", api, step: "fix" });

  if (input.abortController?.signal.aborted) {
    emit({
      type: "step-finished",
      api,
      step: "fix",
      durationMs: Date.now() - fixStartedAt,
      status: "failed",
      reason: "cancelled",
    });
    return {
      changedFiles: [],
      checks: [],
      confidence: "unverified",
      costUsd: 0,
      review: [
        {
          file: ctx.root,
          reason: "cancelled before this service could be fixed",
        },
      ],
    };
  }

  try {
    budget.assertAvailable();
  } catch (error) {
    if (error instanceof BudgetExceededError) {
      emit({
        type: "step-finished",
        api,
        step: "fix",
        durationMs: Date.now() - fixStartedAt,
        status: "failed",
        reason: "budget-exceeded",
      });
      return {
        changedFiles: [],
        checks: [],
        confidence: "unverified",
        costUsd: 0,
        review: [
          {
            file: ctx.root,
            reason: "budget exhausted before this service could be fixed",
          },
        ],
      };
    }
    throw error;
  }

  const affectedFiles = [...new Set(affected.map((location) => location.file))];
  const { server, changedFiles } = buildAgentTools(
    ctx,
    adapter,
    affectedFiles,
    {
      api,
      ...(input.onEvent !== undefined ? { onEvent: input.onEvent } : {}),
    },
  );

  let costUsd = 0;
  let review: ReviewItem[] = [];
  const pendingToolCalls = new Map<
    string,
    { tool: AgentToolName; file?: string }
  >();

  const agentQuery = query({
    prompt: buildPrompt(changes, affected),
    options: {
      model,
      cwd: ctx.root,
      tools: TOOL_NAMES.map(qualifiedToolName),
      mcpServers: { [TOOL_SERVER_NAME]: server },
      strictMcpConfig: true,
      permissionMode: "bypassPermissions",
      settingSources: [],
      maxBudgetUsd: budget.remaining,
      ...(input.abortController !== undefined
        ? { abortController: input.abortController }
        : {}),
      systemPrompt:
        "You are schemend's fix agent. You only have four tools: read_file, edit_file, " +
        "run_build, run_tests. You have no shell access and cannot read or edit any file " +
        "outside the ones you are told are affected.",
    },
  });

  try {
    for await (const message of agentQuery) {
      if (message.type === "assistant") {
        for (const block of message.message.content) {
          if (block.type !== "tool_use") continue;
          const toolName = shortToolName(block.name);
          if (!toolName) continue;

          if (toolName === "read_file" || toolName === "edit_file") {
            const file = extractPath(block.input) ?? "";
            pendingToolCalls.set(block.id, { tool: toolName, file });
            emit({
              type: "agent-tool-call",
              api,
              toolUseId: block.id,
              tool: toolName,
              file,
            });
          } else {
            pendingToolCalls.set(block.id, { tool: toolName });
            emit({
              type: "agent-tool-call",
              api,
              toolUseId: block.id,
              tool: toolName,
            });
          }
        }
      } else if (message.type === "user") {
        const content = message.message.content;
        if (!Array.isArray(content)) continue;

        for (const block of content) {
          if (block.type !== "tool_result") continue;
          const pending = pendingToolCalls.get(block.tool_use_id);
          if (!pending) continue;
          pendingToolCalls.delete(block.tool_use_id);

          const status: "success" | "error" = block.is_error
            ? "error"
            : "success";
          const resultContent = block.content;
          const text =
            typeof resultContent === "string"
              ? resultContent
              : (resultContent ?? [])
                  .filter((part) => part.type === "text")
                  .map((part) => part.text)
                  .join("\n");

          switch (pending.tool) {
            case "read_file":
            case "edit_file":
              emit({
                type: "agent-tool-result",
                api,
                toolUseId: block.tool_use_id,
                tool: pending.tool,
                status,
                file: pending.file ?? "",
              });
              break;
            case "run_build":
              emit({
                type: "agent-tool-result",
                api,
                toolUseId: block.tool_use_id,
                tool: "run_build",
                status,
                ...parseBuildResult(text),
              });
              break;
            case "run_tests":
              emit({
                type: "agent-tool-result",
                api,
                toolUseId: block.tool_use_id,
                tool: "run_tests",
                status,
                ...parseTestResult(text),
              });
              break;
          }
        }
      } else if (message.type === "result") {
        costUsd = message.total_cost_usd;
        if (message.subtype === "error_max_budget_usd") {
          review = [{ file: ctx.root, reason: "budget exceeded while fixing" }];
        }
      }
    }
  } catch (error) {
    if (error instanceof AbortError) {
      review = [{ file: ctx.root, reason: "cancelled while fixing" }];
    } else {
      throw error;
    }
  }

  const cancelled = review.some((item) => item.reason.includes("cancelled"));
  const budgetExceeded = review.some((item) => item.reason.includes("budget"));
  emit({
    type: "step-finished",
    api,
    step: "fix",
    durationMs: Date.now() - fixStartedAt,
    status: cancelled || budgetExceeded ? "failed" : "passed",
    ...(cancelled
      ? { reason: "cancelled" as const }
      : budgetExceeded
        ? { reason: "budget-exceeded" as const }
        : {}),
  });

  budget.record(costUsd);
  if (costUsd > 0) {
    emit({
      type: "cost-updated",
      api,
      spentUsd: budget.spent,
      limitUsd: budget.limitUsd,
    });
  }

  if (cancelled) {
    return {
      changedFiles: [...changedFiles],
      checks: [],
      confidence: "unverified",
      costUsd,
      review,
    };
  }

  const verifyStartedAt = Date.now();
  emit({ type: "step-started", api, step: "verify" });
  const finalBuild = await adapter.build(ctx);
  emit({ type: "check-result", api, check: finalBuild });
  const finalTest = await adapter.test(ctx);
  emit({ type: "check-result", api, check: finalTest });
  const confidence: Confidence =
    finalTest.status === "passed"
      ? "verified-by-tests"
      : finalBuild.status === "passed"
        ? "verified-by-build"
        : "unverified";
  emit({
    type: "step-finished",
    api,
    step: "verify",
    durationMs: Date.now() - verifyStartedAt,
    status:
      finalBuild.status === "passed" && finalTest.status === "passed"
        ? "passed"
        : "failed",
  });

  return {
    changedFiles: [...changedFiles],
    checks: [finalBuild, finalTest],
    confidence,
    costUsd,
    review,
  };
}
