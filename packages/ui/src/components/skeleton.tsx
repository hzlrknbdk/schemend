import { cn } from "../lib/utils";

export interface SkeletonProps {
	className?: string | undefined;
}

export function Skeleton({ className }: SkeletonProps) {
	return <div className={cn("animate-pulse rounded-md bg-muted", className)} />;
}
