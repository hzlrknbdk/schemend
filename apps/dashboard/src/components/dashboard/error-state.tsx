import { Button, Callout } from "@schemend/ui";
import { AlertTriangle } from "lucide-react";

interface ErrorStateProps {
	title: string;
	description: string;
	/** Technical detail (e.g. a validation failure's raw issue list) — hidden by default. */
	detail?: string | undefined;
	/** Omit when retrying can't change the outcome (not-found, validation). */
	onRetry?: (() => void) | undefined;
}

export function ErrorState({
	title,
	description,
	detail,
	onRetry,
}: ErrorStateProps) {
	return (
		<Callout tone="danger" icon={AlertTriangle} title={title}>
			<p className="mt-2 text-xs leading-5 text-muted-foreground">
				{description}
			</p>
			{detail && (
				<details className="mt-3 text-xs text-muted-foreground">
					<summary className="cursor-pointer select-none font-medium text-foreground">
						Technical details
					</summary>
					<pre className="mt-2 overflow-x-auto whitespace-pre-wrap font-mono text-2xs">
						{detail}
					</pre>
				</details>
			)}
			{onRetry && (
				<Button variant="outline" size="sm" className="mt-4" onClick={onRetry}>
					Try again
				</Button>
			)}
		</Callout>
	);
}
