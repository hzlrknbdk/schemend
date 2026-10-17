import type {
  AffectedLocation,
  ApiChange,
  CheckResult,
  RunReport,
  ServiceResult,
} from "./types.js";

export const EVENT_SCHEMA_VERSION = 6;

export type CheckStepName =
  | "detect"
  | "baseline"
  | "regenerate"
  | "impact"
  | "fix"
  | "verify"
  | "commit"
  | "push";

export type StepStatus = "passed" | "failed" | "skipped";

export type StepFailureReason =
  | "baseline-failed"
  | "budget-exceeded"
  | "cancelled"
  | "docker-unavailable"
  | "missing-api-key"
  | "schema-read-failed"
  | "push-failed"
  | "other";

/** The fix agent's five tools (agent-tools.ts); shared here so events don't depend on agent-tools.ts. */
export type AgentToolName =
  | "read_file"
  | "edit_file"
  | "run_build"
  | "run_tests"
  | "flag";

type AgentToolCallDetail =
  | { tool: "read_file"; file: string }
  | { tool: "edit_file"; file: string }
  | { tool: "run_build" }
  | { tool: "run_tests" }
  | { tool: "flag"; file: string; reason: string };

type AgentToolResultDetail =
  | { tool: "read_file"; status: "success" | "error"; file: string }
  | { tool: "edit_file"; status: "success" | "error"; file: string }
  | { tool: "flag"; status: "success" | "error"; file: string }
  | {
      tool: "run_build";
      status: "success" | "error";
      /** Whether the build actually passed - distinct from `status`, which is only whether the tool call itself crashed (run_build never throws on a failed build). */
      checkStatus?: "passed" | "failed";
      errorCount?: number;
      firstError?: string;
    }
  | {
      tool: "run_tests";
      status: "success" | "error";
      checkStatus?: "passed" | "failed";
      passed?: number;
      failed?: number;
      firstFailure?: string;
    };

/** Everything runCheck/runFixAgent report while running (SPEC §9); core only produces these, never renders anything itself. Discriminated on `type`; every variant carries `timestamp`, and all but the two run-level ones carry `api`. */
export type CheckEvent = { timestamp: string } & (
  | {
      type: "run-started";
      eventSchemaVersion: number;
      apis: string[];
      budgetUsd: number;
    }
  | { type: "run-finished"; report: RunReport }
  | { type: "step-started"; api: string; step: CheckStepName }
  | {
      type: "step-finished";
      api: string;
      step: CheckStepName;
      durationMs: number;
      status: StepStatus;
      reason?: StepFailureReason;
    }
  | { type: "changes-detected"; api: string; changes: ApiChange[] }
  | { type: "affected-found"; api: string; affected: AffectedLocation[] }
  | {
      /**
       * Parsed from the SDK's own `system`/`init` message (first message of the fix agent's
       * turn) - `apiKeySource` is the SDK's own account-info field naming where the credential
       * it used actually came from ("ANTHROPIC_API_KEY" is the only supported one; anything else
       * - "apiKeyHelper", "/login managed key", "none" (e.g. a subscription/OAuth login) - means
       * the explicit env passed to query() was bypassed). Recorded, not acted on: this product
       * doesn't support any auth path other than ANTHROPIC_API_KEY, so a renderer/log line is the
       * right response, not a new failure mode core would have to define.
       */
      type: "agent-session-started";
      api: string;
      apiKeySource: string;
    }
  | ({
      type: "agent-tool-call";
      api: string;
      toolUseId: string;
    } & AgentToolCallDetail)
  | ({
      type: "agent-tool-result";
      api: string;
      toolUseId: string;
    } & AgentToolResultDetail)
  | {
      type: "file-edited";
      api: string;
      file: string;
      added: number;
      removed: number;
      diff: string;
    }
  | { type: "check-result"; api: string; check: CheckResult }
  | { type: "cost-updated"; api: string; spentUsd: number; limitUsd: number }
  | { type: "service-completed"; api: string; service: ServiceResult }
);

/** Distributes Omit over CheckEvent's union so each variant keeps its own extra fields (plain Omit would collapse to only the fields every variant shares). */
type DistributiveOmit<T, K extends keyof T> = T extends unknown
  ? Omit<T, K>
  : never;

export function createEventEmitter(
  onEvent?: (event: CheckEvent) => void,
): (event: DistributiveOmit<CheckEvent, "timestamp">) => void {
  return (event) => {
    onEvent?.({ ...event, timestamp: new Date().toISOString() } as CheckEvent);
  };
}
