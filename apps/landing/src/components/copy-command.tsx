import { Button } from "@schemend/ui";
import { Check, Clipboard } from "lucide-react";
import { useState } from "react";

export interface CopyCommandProps {
	command: string;
}

export function CopyCommand({ command }: CopyCommandProps) {
	const [isCopied, setIsCopied] = useState(false);
	const copy = async () => {
		await navigator.clipboard.writeText(command);
		setIsCopied(true);
		window.setTimeout(() => setIsCopied(false), 1600);
	};
	return (
		<div className="flex w-full min-w-0 max-w-full items-center justify-between gap-4 overflow-hidden rounded-md border border-border bg-code px-4 py-3 text-code-foreground">
			<code className="min-w-0 overflow-x-auto whitespace-nowrap font-mono text-xs sm:text-sm">
				{command}
			</code>
			<Button
				variant="ghost"
				size="icon"
				onClick={copy}
				aria-label={`Copy ${command}`}
				className="shrink-0 text-code-foreground hover:bg-sidebar-accent hover:text-sidebar-foreground"
			>
				{isCopied ? <Check /> : <Clipboard />}
			</Button>
		</div>
	);
}
