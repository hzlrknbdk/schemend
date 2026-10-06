import { Slot } from "@radix-ui/react-slot";
import type { ReactNode } from "react";
import { cn } from "../lib/utils";

export interface CardProps {
	asChild?: boolean | undefined;
	className?: string | undefined;
	children: ReactNode;
}

export function Card({ asChild = false, className, children }: CardProps) {
	const Comp = asChild ? Slot : "div";
	return (
		<Comp className={cn("rounded-lg border border-border bg-card", className)}>
			{children}
		</Comp>
	);
}
