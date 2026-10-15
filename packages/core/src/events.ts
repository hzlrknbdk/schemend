import type {
  AffectedLocation,
  ApiChange,
  CheckResult,
  RunReport,
  ServiceResult,
} from "./types.js";

export const EVENT_SCHEMA_VERSION = 2;

export type CheckStepName =
  | "detect"
  | "baseline"
  | "regenerate"
  | "impact"
  | "fix"
  | "verify"
  | "commit";

export type StepStatus = "passed" | "failed" | "skipped";

export type StepFailureReason =
  | "baseline-failed"
  | "budget-exceeded"
  | "cancelled"
  | "docker-unavailable"
  | "schema-read-failed"
  | "other";

/** The fix agent's four tools (agent-tools.ts); shared here so events don't depend on agent-tools.ts. */
export type AgentToolName =
  | "read_file"
  | "edit_file"
  | "run_build"
  | "run_tests";

type AgentToolCallDetail =
  | { tool: "read_file"; file: string }
  | { tool: "edit_file"; file: string }
  | { tool: "run_build" }
  | { tool: "run_tests" };

type AgentToolResultDetail =
  | { tool: "read_file"; status: "success" | "error"; file: string }
  | { tool: "edit_file"; status: "success" | "error"; file: string }
  | {
      tool: "run_build";
      status: "success" | "error";
      /** Whether the underlying build actually passed - distinct from `status`, which is only
       * whether the tool call itself crashed (run_build never throws on a failed build, so
       * `status` alone would always read "success"). Absent only if the result text didn't look
       * like schemend's own formatCheck wrapper at all (shouldn't happen in practice). */
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

/**
 * Everything runCheck/runFixAgent can report while they run (SPEC §9's progress output, generalized
 * beyond a single log line). Core only ever produces these and hands them to onEvent; it never
 * renders or prints anything itself. Discriminated on `type`; every variant carries `timestamp`
 * (ISO, for fixture replay / --record-events) and, except the two run-level ones, `api` (the
 * config.apis entry it's about, since one config can call several APIs).
 */
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
