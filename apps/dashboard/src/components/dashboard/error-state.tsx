import { AlertTriangle } from "lucide-react";

interface ErrorStateProps {
	title: string;
	description: string;
}

export function ErrorState({ title, description }: ErrorStateProps) {
	return (
		<div className="rounded-lg border border-danger/35 bg-danger-soft p-5">
			<AlertTriangle className="size-5 text-danger" />
			<h2 className="mt-3 text-sm font-semibold">{title}</h2>
			<p className="mt-2 text-xs leading-5 text-muted-foreground">
				{description}
			</p>
		</div>
	);
}
