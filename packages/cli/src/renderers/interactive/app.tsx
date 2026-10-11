import { Box, Text, useInput, useStdin } from "ink";
import { useEffect, useState, useSyncExternalStore } from "react";
import { AgentPanel } from "./agent-panel.js";
import { BudgetBar } from "./budget-bar.js";
import { DiffView } from "./diff-view.js";
import type { EventStore } from "./event-store.js";
import { Header } from "./header.js";
import { StepsPanel } from "./steps-panel.js";
import type { ApiState } from "./store.js";
import { Summary } from "./summary.js";

export interface AppProps {
	store: EventStore;
	productName: string;
	version: string;
	consumer: string;
	onCancel: () => void;
	/**
	 * Terminal width override. Defaults to the real process.stdout.columns; ink-testing-library's
	 * render() hardcodes its fake stdout to 100 columns with no way to override it, so this is how
	 * the narrow (<80) layout gets exercised in tests.
	 */
	columns?: number;
}

/** Below this terminal width, the steps/agent panels stack instead of sitting side by side. */
const WIDE_TERMINAL_COLUMNS = 80;

/**
 * Tracks process.stdout.columns live. useSyncExternalStore only re-renders on a CheckEvent, so
 * without this a resize mid-run (e.g. during a long "baseline" with nothing new to report) would
 * leave the layout stuck at whatever width the terminal had when the last event arrived.
 */
function useTerminalColumns(): number {
	const [columns, setColumns] = useState(
		() => process.stdout.columns ?? WIDE_TERMINAL_COLUMNS,
	);

	useEffect(() => {
		const handleResize = () => {
			setColumns(process.stdout.columns ?? WIDE_TERMINAL_COLUMNS);
		};
		process.stdout.on("resize", handleResize);
		return () => {
			process.stdout.off("resize", handleResize);
		};
	}, []);

	return columns;
}

export function App({
	store,
	productName,
	version,
	consumer,
	onCancel,
	columns,
}: AppProps) {
	const state = useSyncExternalStore(store.subscribe, store.getState);
	const liveColumns = useTerminalColumns();
	const isWide = (columns ?? liveColumns) >= WIDE_TERMINAL_COLUMNS;
	const isRunning = state.report === undefined;
	const { isRawModeSupported } = useStdin();
	const canCancel = isRawModeSupported && isRunning;

	useInput(
		(input) => {
			if (input === "q") onCancel();
		},
		{ isActive: canCancel },
	);

	const apis: ApiState[] = state.apiOrder
		.map((api) => state.apis[api])
		.filter((apiState): apiState is ApiState => apiState !== undefined);
	const breakingCount = apis.reduce(
		(total, apiState) =>
			total +
			apiState.changes.filter((change) => change.severity === "breaking")
				.length,
		0,
	);
	const spentUsd =
		state.report?.spentUsd ??
		apis.reduce((total, apiState) => total + (apiState.spentUsd ?? 0), 0);
	const budgetUsd = state.report?.budgetUsd ?? state.budgetUsd;

	return (
		<Box flexDirection="column">
			<Header
				productName={productName}
				version={version}
				consumer={consumer}
				apis={state.apiOrder}
				breakingCount={breakingCount}
			/>
			<Box flexDirection={isWide ? "row" : "column"}>
				<StepsPanel apis={apis} />
				<AgentPanel apis={apis} />
			</Box>
			<DiffView lastEdit={state.lastEdit} />
			<BudgetBar spentUsd={spentUsd} budgetUsd={budgetUsd} />
			{state.report ? (
				<Summary report={state.report} />
			) : (
				canCancel && <Text dimColor>Press q to cancel</Text>
			)}
		</Box>
	);
}
