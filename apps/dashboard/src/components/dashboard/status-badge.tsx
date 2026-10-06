import { cn } from "@schemend/ui";

export type BadgeTone = "success" | "warning" | "danger" | "info" | "neutral";

interface StatusBadgeProps {
	tone: BadgeTone;
	label: string;
}

const toneClasses: Record<BadgeTone, string> = {
	success: "border-success/25 bg-success-soft text-success",
	warning: "border-warning/25 bg-warning-soft text-warning",
	danger: "border-danger/25 bg-danger-soft text-danger",
	info: "border-info/25 bg-info-soft text-info",
	neutral: "border-border bg-muted text-muted-foreground",
};

const dotToneClasses: Record<BadgeTone, string> = {
	success: "bg-success",
	warning: "bg-warning",
	danger: "bg-danger",
	info: "bg-info",
	neutral: "bg-muted-foreground",
};

export function StatusBadge({ tone, label }: StatusBadgeProps) {
	return (
		<span
			className={cn(
				"inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs font-medium",
				toneClasses[tone],
			)}
		>
			<span className={cn("size-1.5 rounded-full", dotToneClasses[tone])} />
			{label}
		</span>
	);
}
