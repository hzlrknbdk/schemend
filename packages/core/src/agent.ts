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
  ApiEntry,
  CheckResult,
  Confidence,
  ReviewItem,
} from "./types.js";

/**
 * Thrown before the SDK is ever called, when ANTHROPIC_API_KEY isn't set. Without this check, a
 * missing key doesn't fail the way SPEC §9 ("missing key" is a clear, never-silent error)
 * promises - the SDK's spawned subprocess falls through to whatever auth the host's own `claude`
 * CLI already has configured (e.g. a Pro/Max subscription login), which this product does not
 * support (SPEC §1/§5: the user brings their own Anthropic API key; cost is tracked in USD against
 * that key, which a subscription login has no equivalent of).
 */
export class MissingApiKeyError extends Error {
  constructor() {
    super(
      "ANTHROPIC_API_KEY is not set. schemend needs your own Anthropic API key (see " +
        "SPEC §5) - a Claude subscription/OAuth login is not a supported substitute.",
    );
    this.name = "MissingApiKeyError";
  }
}

// Only what the spawned `claude` subprocess genuinely needs to run (locate its runtime, find its
// own config/cache dirs) - not a denylist of known-bad vars, which can't anticipate a future
// ambient agent session using a different naming scheme. Same isolation reasoning as
// settingSources: [] below: the host's own CLAUDE_CODE_*/session vars (the ones that let a
// missing-key run silently fall through to this machine's own claude login, see
// MissingApiKeyError and DECISIONS.md 2026-10-16) must not reach the subprocess at all, key
// present or not.
const SDK_SUBPROCESS_ENV_ALLOWLIST = [
  "PATH",
  "HOME",
  "LANG",
  "TMPDIR",
  "SHELL",
] as const;

function buildAgentEnv(apiKey: string): Record<string, string> {
  const env: Record<string, string> = { ANTHROPIC_API_KEY: apiKey };
  for (const name of SDK_SUBPROCESS_ENV_ALLOWLIST) {
    const value = process.env[name];
    if (value !== undefined) env[name] = value;
  }
  return env;
}

export interface FixAgentInput {
  ctx: AdapterContext;
  adapter: Pick<LanguageAdapter, "build" | "test" | "findAffected">;
  apiEntry: ApiEntry;
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
    "Use read_file to inspect a file before editing it. Use edit_file to fix the files listed " +
      "above. After editing, call run_build and run_tests to verify your fix. That list of " +
      "editable files can grow: if run_build still fails after your fix, it may report that " +
      "other files are now also affected (e.g. a test fixture only reachable once the main " +
      "code compiles) - run_build's own result will name them when that happens, and you may " +
      "then edit those too. Don't edit any file that hasn't been named as affected, originally " +
      "or newly. Keep fixing within whatever is currently affected until build and tests pass " +
      "or you run out of ideas, then stop. If a change you just made rests on a behavioral " +
      "assumption you can't verify from the schema alone (e.g. a currency, unit, or format " +
      "assumption in the same code), call flag with that file and why - after fixing what you " +
      "can, not in place of it.",
  ].join("\n");
}

/** Pulls the `[[schemend:summary]]{...}` trailer `formatCheck` (agent-tools.ts) appends to a failed result - reads schemend's own wrapper, never a compiler's format, so one regex covers every language. */
function parseSummaryTag(text: string): Record<string, unknown> {
  const match = text.match(/\[\[schemend:summary\]\](.*)$/m);
  if (!match?.[1]) return {};
  try {
    const parsed = JSON.parse(match[1]);
    return typeof parsed === "object" && parsed !== null ? parsed : {};
  } catch {
    return {};
  }
}

/** `formatCheck` always starts with "<name>: passed" or "<name>: failed" - checking the first line's ending is enough, no per-adapter knowledge needed. */
function parseCheckStatus(text: string): "passed" | "failed" | undefined {
  const firstLine = text.split("\n", 1)[0] ?? "";
  if (firstLine.endsWith(": passed")) return "passed";
  if (firstLine.endsWith(": failed")) return "failed";
  return undefined;
}

/** The tool's `input` is typed `unknown` by the SDK (zod shape isn't known at this generic point). */
function extractPath(input: unknown): string | undefined {
  if (typeof input === "object" && input !== null && "path" in input) {
    const value = (input as { path: unknown }).path;
    return typeof value === "string" ? value : undefined;
  }
  return undefined;
}

/** Same reasoning as extractPath, but flag's tool uses `file`/`reason`, not `path`. */
function extractFlagInput(
  input: unknown,
): { file: string; reason: string } | undefined {
  if (typeof input !== "object" || input === null) return undefined;
  const { file, reason } = input as { file: unknown; reason: unknown };
  if (typeof file !== "string" || typeof reason !== "string") return undefined;
  return { file, reason };
}

/**
 * Merges the agent's own flag-tool reports into the orchestrator's review list and dedupes by
 * file+reason (a model can call flag twice with the same args). The single place every exit path
 * (normal, cancelled, budget-exceeded) routes `review` through, so a future new exit path can't
 * forget to include flags. Exported for direct testing of the merge/dedup logic itself.
 */
export function finalizeReview(
  review: readonly ReviewItem[],
  flags: readonly ReviewItem[],
): ReviewItem[] {
  const seen = new Set<string>();
  const result: ReviewItem[] = [];
  for (const item of [...review, ...flags]) {
    const key = `${item.file}\u0000${item.reason}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(item);
  }
  return result;
}

/**
 * Fix + Verify (SPEC §2 steps 5-6). Assumes the caller already ran baseline (step 3) and
 * regeneration + impact (step 4). A bash-free Claude Agent SDK loop restricted to
 * read_file/edit_file/run_build/run_tests/flag (SPEC §6), bounded by `maxBudgetUsd`; "retry
 * within budget" is the agent calling run_build/run_tests itself, not separate code. Confidence
 * and the final checks come from our own build/test after the loop, not the agent's self-reports.
 *
 * Emits step-started/-finished ("fix", "verify"), agent-tool-call/-result (parsed from the SDK's
 * message stream, see DECISIONS.md), check-result, and cost-updated once the SDK reports a real
 * total_cost_usd. An aborted `abortController` is a clean stop (confidence "unverified"), not a
 * crash - the final "verify" build/test is skipped entirely. Every returned `review` (every exit
 * path, including cancelled/budget-exceeded) is `finalizeReview`'d, so the agent's own flag calls
 * are never lost regardless of how the run ends.
 */
export async function runFixAgent(
  input: FixAgentInput,
): Promise<FixAgentOutput> {
  const { ctx, adapter, apiEntry, affected, changes, budget, model, api } =
    input;
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
      review: finalizeReview(
        [
          {
            file: ctx.root,
            reason: "cancelled before this service could be fixed",
          },
        ],
        [],
      ),
    };
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey || apiKey.trim() === "") {
    emit({
      type: "step-finished",
      api,
      step: "fix",
      durationMs: Date.now() - fixStartedAt,
      status: "failed",
      reason: "missing-api-key",
    });
    throw new MissingApiKeyError();
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
        review: finalizeReview(
          [
            {
              file: ctx.root,
              reason: "budget exhausted before this service could be fixed",
            },
          ],
          [],
        ),
      };
    }
    throw error;
  }

  const affectedFiles = [...new Set(affected.map((location) => location.file))];
  const { server, changedFiles, flags } = buildAgentTools(
    ctx,
    adapter,
    affectedFiles,
    apiEntry,
    changes,
    input.onEvent,
  );

  let costUsd = 0;
  let review: ReviewItem[] = [];
  const pendingToolCalls = new Map<
    string,
    { tool: AgentToolName; file?: string; reason?: string }
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
      env: buildAgentEnv(apiKey),
      maxBudgetUsd: budget.remaining,
      ...(input.abortController !== undefined
        ? { abortController: input.abortController }
        : {}),
      systemPrompt:
        "You are schemend's fix agent. You only have five tools: read_file, edit_file, " +
        "run_build, run_tests, flag. You have no shell access and can only edit files you have " +
        "been told are affected - that set can grow mid-session (run_build will tell you when " +
        "it does), but you may never edit a file that hasn't been named as affected. Fix every " +
        "structural change you can - flag is not a substitute for fixing. Only call flag for a " +
        "behavioral assumption tied to an edit you can't verify is still correct (e.g. the " +
        "schema change tells you a field changed, not whether a currency/unit assumption built " +
        "on it is still valid) - not for every change, and not instead of a fix you're able to " +
        "make.",
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
          } else if (toolName === "flag") {
            const flagInput = extractFlagInput(block.input);
            pendingToolCalls.set(block.id, {
              tool: toolName,
              file: flagInput?.file ?? "",
              reason: flagInput?.reason ?? "",
            });
            emit({
              type: "agent-tool-call",
              api,
              toolUseId: block.id,
              tool: "flag",
              file: flagInput?.file ?? "",
              reason: flagInput?.reason ?? "",
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
            case "flag":
              emit({
                type: "agent-tool-result",
                api,
                toolUseId: block.tool_use_id,
                tool: pending.tool,
                status,
                file: pending.file ?? "",
              });
              break;
            case "run_build": {
              const checkStatus = parseCheckStatus(text);
              const summary = parseSummaryTag(text);
              emit({
                type: "agent-tool-result",
                api,
                toolUseId: block.tool_use_id,
                tool: "run_build",
                status,
                ...(checkStatus !== undefined ? { checkStatus } : {}),
                ...(typeof summary.errorCount === "number"
                  ? { errorCount: summary.errorCount }
                  : {}),
                ...(typeof summary.firstError === "string"
                  ? { firstError: summary.firstError }
                  : {}),
              });
              break;
            }
            case "run_tests": {
              const checkStatus = parseCheckStatus(text);
              const summary = parseSummaryTag(text);
              emit({
                type: "agent-tool-result",
                api,
                toolUseId: block.tool_use_id,
                tool: "run_tests",
                status,
                ...(checkStatus !== undefined ? { checkStatus } : {}),
                ...(typeof summary.passed === "number"
                  ? { passed: summary.passed }
                  : {}),
                ...(typeof summary.failed === "number"
                  ? { failed: summary.failed }
                  : {}),
                ...(typeof summary.firstFailure === "string"
                  ? { firstFailure: summary.firstFailure }
                  : {}),
              });
              break;
            }
          }
        }
      } else if (message.type === "result") {
        costUsd = message.total_cost_usd;
        if (message.subtype === "error_max_budget_usd") {
          review = [{ file: ctx.root, reason: "budget exceeded while fixing" }];
        }
      } else if (message.type === "system" && message.subtype === "init") {
        emit({
          type: "agent-session-started",
          api,
          apiKeySource: message.apiKeySource,
        });
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
      review: finalizeReview(review, flags),
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
    review: finalizeReview(review, flags),
  };
}
