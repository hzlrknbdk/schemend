export function formatUsd(value: number): string {
	return `$${value.toFixed(2)}`;
}

export function formatDuration(ms: number): string {
	return ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(1)}s`;
}
