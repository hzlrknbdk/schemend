import type {
  AffectedLocation,
  ApiChange,
  CheckEvent,
  CheckStepName,
  RunReport,
  ServiceResult,
  StepFailureReason,
  StepStatus,
} from "@schemend/core";

export const STEP_ORDER: CheckStepName[] = [
  "detect",
  "baseline",
  "regenerate",
  "impact",
  "fix",
  "verify",
  "commit",
];

export interface StepState {
  status: "pending" | "running" | StepStatus;
  durationMs?: number;
  reason?: StepFailureReason;
}

export interface ToolLogEntry {
  toolUseId: string;
  text: string;
  status?: "success" | "error";
}

export interface ApiState {
  api: string;
  steps: Record<CheckStepName, StepState>;
  changes: ApiChange[];
  affected: AffectedLocation[];
  toolLog: ToolLogEntry[];
  spentUsd?: number;
  service?: ServiceResult;
}

export interface UiState {
  budgetUsd: number;
  apiOrder: string[];
  apis: Record<string, ApiState>;
  lastEdit?: {
    api: string;
    file: string;
    added: number;
    removed: number;
    diff: string;
  };
  report?: RunReport;
}

const MAX_TOOL_LOG_ENTRIES = 8;

function emptySteps(): Record<CheckStepName, StepState> {
  const steps = {} as Record<CheckStepName, StepState>;
  for (const step of STEP_ORDER) steps[step] = { status: "pending" };
  return steps;
}

function emptyApiState(api: string): ApiState {
  return { api, steps: emptySteps(), changes: [], affected: [], toolLog: [] };
}

export function createInitialState(): UiState {
  return { budgetUsd: 0, apiOrder: [], apis: {} };
}

function withApi(
  state: UiState,
  api: string,
  update: (apiState: ApiState) => ApiState,
): UiState {
  const existing = state.apis[api] ?? emptyApiState(api);
  const apiOrder = state.apis[api] ? state.apiOrder : [...state.apiOrder, api];
  return {
    ...state,
    apiOrder,
    apis: { ...state.apis, [api]: update(existing) },
  };
}

function describeToolCall(
  event: Extract<CheckEvent, { type: "agent-tool-call" }>,
): string {
  switch (event.tool) {
    case "read_file":
    case "edit_file":
      return `-> ${event.tool} ${event.file}`;
    case "run_build":
    case "run_tests":
      return `-> ${event.tool}`;
  }
}

function describeToolResult(
  event: Extract<CheckEvent, { type: "agent-tool-result" }>,
): string {
  switch (event.tool) {
    case "read_file":
    case "edit_file":
      return `<- ${event.tool} ${event.file} (${event.status})`;
    case "run_build": {
      // `status` is only whether the tool call itself crashed - `checkStatus` is the real build
      // outcome (see plain.ts's formatToolResult for the same distinction).
      const outcome =
        event.status === "error"
          ? "tool error"
          : (event.checkStatus ?? "unknown");
      const detail =
        event.errorCount !== undefined
          ? `, ${event.errorCount} error(s)${event.firstError ? `: ${event.firstError}` : ""}`
          : "";
      return `<- run_build (${outcome})${detail}`;
    }
    case "run_tests": {
      const outcome =
        event.status === "error"
          ? "tool error"
          : (event.checkStatus ?? "unknown");
      const counts =
        event.passed !== undefined || event.failed !== undefined
          ? `, ${event.passed ?? 0} passed / ${event.failed ?? 0} failed`
          : "";
      const detail = event.firstFailure ? `: ${event.firstFailure}` : "";
      return `<- run_tests (${outcome})${counts}${detail}`;
    }
  }
}

export function reduceEvents(state: UiState, event: CheckEvent): UiState {
  switch (event.type) {
    case "run-started": {
      let next = { ...state, budgetUsd: event.budgetUsd };
      for (const api of event.apis) {
        next = withApi(next, api, (apiState) => apiState);
      }
      return next;
    }
    case "run-finished":
      return { ...state, report: event.report };
    case "step-started":
      return withApi(state, event.api, (apiState) => ({
        ...apiState,
        steps: { ...apiState.steps, [event.step]: { status: "running" } },
      }));
    case "step-finished":
      return withApi(state, event.api, (apiState) => ({
        ...apiState,
        steps: {
          ...apiState.steps,
          [event.step]: {
            status: event.status,
            durationMs: event.durationMs,
            ...(event.reason !== undefined ? { reason: event.reason } : {}),
          },
        },
      }));
    case "changes-detected":
      return withApi(state, event.api, (apiState) => ({
        ...apiState,
        changes: event.changes,
      }));
    case "affected-found":
      return withApi(state, event.api, (apiState) => ({
        ...apiState,
        affected: event.affected,
      }));
    case "agent-tool-call":
      return withApi(state, event.api, (apiState) => ({
        ...apiState,
        toolLog: [
          ...apiState.toolLog,
          { toolUseId: event.toolUseId, text: describeToolCall(event) },
        ].slice(-MAX_TOOL_LOG_ENTRIES),
      }));
    case "agent-tool-result":
      return withApi(state, event.api, (apiState) => ({
        ...apiState,
        toolLog: [
          ...apiState.toolLog,
          {
            toolUseId: event.toolUseId,
            text: describeToolResult(event),
            status: event.status,
          },
        ].slice(-MAX_TOOL_LOG_ENTRIES),
      }));
    case "file-edited":
      return {
        ...state,
        lastEdit: {
          api: event.api,
          file: event.file,
          added: event.added,
          removed: event.removed,
          diff: event.diff,
        },
      };
    case "check-result":
      // Already surfaced via the step-finished/agent-tool-result events built from the same
      // data; no panel needs the raw CheckResult on its own today.
      return state;
    case "cost-updated":
      return withApi(state, event.api, (apiState) => ({
        ...apiState,
        spentUsd: event.spentUsd,
      }));
    case "service-completed":
      return withApi(state, event.api, (apiState) => ({
        ...apiState,
        service: event.service,
      }));
    default:
      return event satisfies never;
  }
}
