import { cn } from "@schemend/ui";

interface StatusBadgeProps {
	status: string;
}

export function StatusBadge({ status }: StatusBadgeProps) {
	const isWarning = status === "Needs review" || status === "Stopped";
	const isSuccess = status === "Fixed" || status === "PRs opened";
	return (
		<span
			className={cn(
				"inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs font-medium",
				isWarning && "border-warning/25 bg-warning-soft text-warning",
				isSuccess && "border-success/25 bg-success-soft text-success",
				!isWarning &&
					!isSuccess &&
					"border-border bg-muted text-muted-foreground",
			)}
		>
			<span
				className={cn(
					"size-1.5 rounded-full",
					isWarning && "bg-warning",
					isSuccess && "bg-success",
					!isWarning && !isSuccess && "bg-muted-foreground",
				)}
			/>
			{status}
		</span>
	);
}
