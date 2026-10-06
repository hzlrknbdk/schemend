// Every route here is prerendered to static HTML (see vite.config.ts), so these must be
// deterministic regardless of where the build runs or where the page is later viewed —
// no relative "x minutes ago" text (it would read correctly only at build time) and an
// explicit UTC time zone (so server-rendered and client-hydrated output always match).

export function formatDuration(startedAt: string, finishedAt: string): string {
	const totalSeconds = Math.round(
		(new Date(finishedAt).getTime() - new Date(startedAt).getTime()) / 1000,
	);
	const minutes = Math.floor(totalSeconds / 60);
	const seconds = totalSeconds % 60;
	return minutes > 0
		? `${minutes}m ${String(seconds).padStart(2, "0")}s`
		: `${seconds}s`;
}

export function formatCost(usd: number): string {
	return `$${usd.toFixed(2)}`;
}

export function formatDateTime(iso: string): string {
	return new Date(iso).toLocaleString("en-US", {
		month: "short",
		day: "numeric",
		hour: "2-digit",
		minute: "2-digit",
		timeZone: "UTC",
	});
}
