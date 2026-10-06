import type { ReactNode } from "react";

interface PageHeaderProps {
	eyebrow?: string | undefined;
	title: string;
	description: string;
	action?: ReactNode | undefined;
}

export function PageHeader({
	eyebrow,
	title,
	description,
	action,
}: PageHeaderProps) {
	return (
		<header className="mb-8 flex items-start justify-between gap-6">
			<div>
				{eyebrow && (
					<p className="mb-2 font-mono text-xs font-medium uppercase text-primary">
						{eyebrow}
					</p>
				)}
				<h1 className="text-2xl font-semibold text-foreground">{title}</h1>
				<p className="mt-2 max-w-3xl text-sm text-muted-foreground">
					{description}
				</p>
			</div>
			{action}
		</header>
	);
}
