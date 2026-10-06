export interface SectionHeadingProps {
	eyebrow: string;
	title: string;
	text?: string;
}

export function SectionHeading({ eyebrow, title, text }: SectionHeadingProps) {
	return (
		<div className="mb-12 max-w-3xl">
			<p className="font-mono text-xs font-medium uppercase text-primary">
				{eyebrow}
			</p>
			<h2 className="mt-4 text-3xl font-semibold leading-tight sm:text-4xl">
				{title}
			</h2>
			{text && (
				<p className="mt-4 max-w-2xl text-base leading-7 text-muted-foreground">
					{text}
				</p>
			)}
		</div>
	);
}
