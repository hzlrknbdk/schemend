import { cva } from "class-variance-authority";
import { type Tone, toneDotClasses } from "../lib/tone";
import { cn } from "../lib/utils";

const statusBadgeVariants = cva(
	"inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs font-medium",
	{
		variants: {
			tone: {
				success: "border-success/25 bg-success-soft text-success",
				warning: "border-warning/25 bg-warning-soft text-warning",
				danger: "border-danger/25 bg-danger-soft text-danger",
				info: "border-info/25 bg-info-soft text-info",
				neutral: "border-border bg-muted text-muted-foreground",
			} satisfies Record<Tone, string>,
		},
	},
);

export interface StatusBadgeProps {
	tone: Tone;
	label: string;
}

export function StatusBadge({ tone, label }: StatusBadgeProps) {
	return (
		<span className={cn(statusBadgeVariants({ tone }))}>
			<span className={cn("size-1.5 rounded-full", toneDotClasses[tone])} />
			{label}
		</span>
	);
}
