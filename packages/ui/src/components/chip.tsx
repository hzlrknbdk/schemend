import type { ReactNode } from "react";
import { cn } from "../lib/utils";

export interface ChipProps {
	children: ReactNode;
	className?: string | undefined;
}

export function Chip({ children, className }: ChipProps) {
	return (
		<span
			className={cn(
				"inline-flex items-center rounded-md border border-border bg-muted px-2.5 py-1 text-xs",
				className,
			)}
		>
			{children}
		</span>
	);
}
