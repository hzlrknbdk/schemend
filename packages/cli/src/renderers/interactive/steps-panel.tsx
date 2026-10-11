import { Box, Text } from "ink";
import { formatDuration } from "./format.js";
import type { ApiState, StepState } from "./store.js";
import { STEP_ORDER } from "./store.js";

function stepIcon(status: StepState["status"]): string {
  switch (status) {
    case "pending":
      return "○";
    case "running":
      return "…";
    case "passed":
      return "✓";
    case "failed":
      return "✗";
    case "skipped":
      return "⊘";
  }
}

function stepColor(
  status: StepState["status"],
): "green" | "red" | "yellow" | undefined {
  switch (status) {
    case "passed":
      return "green";
    case "failed":
      return "red";
    case "running":
      return "yellow";
    case "pending":
    case "skipped":
      return undefined;
  }
}

export interface StepsPanelProps {
  apis: ApiState[];
}

/** One box per api (steps panel, SPEC §9): each of the 7 steps with its status and duration. */
export function StepsPanel({ apis }: StepsPanelProps) {
  return (
    <Box
      flexDirection="column"
      borderStyle="round"
      paddingX={1}
      marginRight={1}
    >
      <Text bold underline>
        Steps
      </Text>
      {apis.map((apiState) => (
        <Box
          key={apiState.api}
          flexDirection="column"
          marginTop={apis.length > 1 ? 1 : 0}
        >
          {apis.length > 1 && <Text dimColor>{apiState.api}</Text>}
          {STEP_ORDER.map((step) => {
            const state = apiState.steps[step];
            const color = stepColor(state.status);
            return (
              <Text
                key={step}
                dimColor={
                  state.status === "pending" || state.status === "skipped"
                }
                {...(color !== undefined ? { color } : {})}
              >
                {stepIcon(state.status)} {step}
                {state.durationMs !== undefined
                  ? ` (${formatDuration(state.durationMs)})`
                  : ""}
                {state.reason ? ` - ${state.reason}` : ""}
              </Text>
            );
          })}
        </Box>
      ))}
    </Box>
  );
}
