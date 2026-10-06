import { type Tone, toneDotClasses } from "../lib/tone";
import { cn } from "../lib/utils";

export interface StatusDotProps {
	tone: Tone;
	label: string;
}

export function StatusDot({ tone, label }: StatusDotProps) {
	return (
		<span
			className={cn("inline-block size-2 rounded-full", toneDotClasses[tone])}
		>
			<span className="sr-only">{label}</span>
		</span>
	);
}
