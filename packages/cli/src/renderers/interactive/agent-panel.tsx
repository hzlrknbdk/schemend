import { Box, Text } from "ink";
import type { ApiState } from "./store.js";

export interface AgentPanelProps {
  apis: ApiState[];
}

const MAX_VISIBLE_ENTRIES = 8;

/** Last tool calls/results across every api (agent panel, SPEC §9), most recent last. */
export function AgentPanel({ apis }: AgentPanelProps) {
  const entries = apis
    .flatMap((apiState) =>
      apiState.toolLog.map((entry) => ({ api: apiState.api, ...entry })),
    )
    .slice(-MAX_VISIBLE_ENTRIES);

  return (
    <Box flexDirection="column" borderStyle="round" paddingX={1}>
      <Text bold underline>
        Agent
      </Text>
      {entries.length === 0 && <Text dimColor>(no tool activity yet)</Text>}
      {entries.map((entry, index) => (
        <Text
          // biome-ignore lint/suspicious/noArrayIndexKey: a rolling window, order never changes
          key={`${entry.toolUseId}-${index}`}
          {...(entry.status === "error" ? { color: "red" as const } : {})}
        >
          {entry.api}: {entry.text}
        </Text>
      ))}
    </Box>
  );
}
