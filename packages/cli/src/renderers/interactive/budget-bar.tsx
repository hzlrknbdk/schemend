import { Box, Text } from "ink";
import { formatUsd } from "./format.js";

export interface BudgetBarProps {
	spentUsd: number;
	budgetUsd: number;
}

const BAR_WIDTH = 20;

/** Live spent/limit bar (SPEC §9), red past 90%, yellow past 60%, green otherwise. */
export function BudgetBar({ spentUsd, budgetUsd }: BudgetBarProps) {
	const ratio = budgetUsd > 0 ? Math.min(1, spentUsd / budgetUsd) : 0;
	const filled = Math.round(ratio * BAR_WIDTH);
	const bar = "#".repeat(filled) + " ".repeat(BAR_WIDTH - filled);
	const color = ratio >= 0.9 ? "red" : ratio >= 0.6 ? "yellow" : "green";

	return (
		<Box marginTop={1}>
			<Text color={color}>[{bar}]</Text>
			<Text>
				{" "}
				{formatUsd(spentUsd)} / {formatUsd(budgetUsd)}
			</Text>
		</Box>
	);
}
