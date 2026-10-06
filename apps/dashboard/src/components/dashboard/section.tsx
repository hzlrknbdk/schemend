import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface SectionProps {
	title: string;
	note?: string | undefined;
	action?: ReactNode | undefined;
	children: ReactNode;
	className?: string | undefined;
}

export function Section({
	title,
	note,
	action,
	children,
	className,
}: SectionProps) {
	return (
		<section
			className={cn("rounded-lg border border-border bg-card", className)}
		>
			<div className="flex min-h-14 items-center justify-between border-b border-border px-5">
				<div>
					<h2 className="text-sm font-semibold">{title}</h2>
					{note && (
						<p className="mt-0.5 text-xs text-muted-foreground">{note}</p>
					)}
				</div>
				{action}
			</div>
			{children}
		</section>
	);
}
