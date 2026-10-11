import { Box, Text } from "ink";
import type { UiState } from "./store.js";

export interface DiffViewProps {
	lastEdit: UiState["lastEdit"];
}

const MAX_VISIBLE_LINES = 12;

type DiffLineKind = "add" | "remove" | "context";

function classifyDiffLine(line: string): DiffLineKind {
	if (line.startsWith("+++") || line.startsWith("---")) return "context";
	if (line.startsWith("+")) return "add";
	if (line.startsWith("-")) return "remove";
	return "context";
}

/** Colorized diff of the most recently edited file (SPEC §9), capped to a readable number of lines. */
export function DiffView({ lastEdit }: DiffViewProps) {
	if (!lastEdit) {
		return (
			<Box borderStyle="round" paddingX={1}>
				<Text dimColor>(no file edited yet)</Text>
			</Box>
		);
	}

	const lines = lastEdit.diff.split("\n").slice(0, MAX_VISIBLE_LINES);

	return (
		<Box flexDirection="column" borderStyle="round" paddingX={1}>
			<Text bold underline>
				{lastEdit.file} (+{lastEdit.added}/-{lastEdit.removed})
			</Text>
			{lines.map((line, index) => {
				const kind = classifyDiffLine(line);
				const color =
					kind === "add" ? "green" : kind === "remove" ? "red" : undefined;
				return (
					<Text
						// biome-ignore lint/suspicious/noArrayIndexKey: static diff lines, order never changes
						key={`${line}-${index}`}
						dimColor={kind === "context"}
						{...(color !== undefined ? { color } : {})}
					>
						{line}
					</Text>
				);
			})}
		</Box>
	);
}
