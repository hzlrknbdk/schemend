import { SectionHeading } from "@/components/section-heading";

const items: [number: string, title: string, text: string][] = [
	[
		"01",
		"Breaking changes reach consumers late",
		"Teams find out in production or during the next sprint, when context is already lost.",
	],
	[
		"02",
		"Migrations are repetitive",
		"The same mechanical fix must be repeated across dozens of files and services.",
	],
	[
		"03",
		"Version bumps are not fixes",
		"Dependency bots update versions. They do not update the code that calls them.",
	],
];

export function Problem() {
	return (
		<section className="border-b border-border">
			<div className="mx-auto max-w-7xl px-5 py-20 sm:px-8">
				<SectionHeading
					eyebrow="The problem"
					title="Version alerts stop before the actual work starts."
				/>
				<div className="grid gap-px overflow-hidden rounded-lg border border-border bg-border md:grid-cols-3">
					{items.map(([number, title, text]) => (
						<div key={number} className="bg-card p-7">
							<span className="font-mono text-xs text-primary">{number}</span>
							<h3 className="mt-7 text-base font-semibold">{title}</h3>
							<p className="mt-3 text-sm leading-6 text-muted-foreground">
								{text}
							</p>
						</div>
					))}
				</div>
			</div>
		</section>
	);
}
