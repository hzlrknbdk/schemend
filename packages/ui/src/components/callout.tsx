import { cva } from "class-variance-authority";
import type { ComponentType, ReactNode } from "react";
import type { Tone } from "../lib/tone";
import { cn } from "../lib/utils";

type Icon = ComponentType<{ className?: string }>;

type CalloutTone = Extract<Tone, "warning" | "danger">;

const calloutVariants = cva("rounded-lg border p-5", {
	variants: {
		tone: {
			warning: "border-warning/35 bg-warning-soft",
			danger: "border-danger/35 bg-danger-soft",
		} satisfies Record<CalloutTone, string>,
	},
});

const calloutIconClasses: Record<CalloutTone, string> = {
	warning: "text-warning",
	danger: "text-danger",
};

export interface CalloutProps {
	tone: CalloutTone;
	icon: Icon;
	title: string;
	children: ReactNode;
	className?: string | undefined;
}

export function Callout({
	tone,
	icon: Icon,
	title,
	children,
	className,
}: CalloutProps) {
	return (
		<div className={cn(calloutVariants({ tone }), className)}>
			<Icon className={cn("size-5", calloutIconClasses[tone])} />
			<h2 className="mt-3 text-sm font-semibold">{title}</h2>
			{children}
		</div>
	);
}
