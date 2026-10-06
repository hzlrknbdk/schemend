import { Callout } from "@schemend/ui";
import { AlertTriangle } from "lucide-react";

interface ErrorStateProps {
	title: string;
	description: string;
}

export function ErrorState({ title, description }: ErrorStateProps) {
	return (
		<Callout tone="danger" icon={AlertTriangle} title={title}>
			<p className="mt-2 text-xs leading-5 text-muted-foreground">
				{description}
			</p>
		</Callout>
	);
}
