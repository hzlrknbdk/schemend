import { SectionHeading } from "@/components/section-heading";

const groups: [group: string, items: string[]][] = [
	["Languages", ["TypeScript", "Java", "C#"]],
	["Platforms", ["GitHub", "GitLab", "Bitbucket", "Azure DevOps"]],
	["Schemas", ["OpenAPI (REST)", "External SDK migrations"]],
	["Runs as", ["npm CLI", "Docker image", "Any CI"]],
];

export function Compatibility() {
	return (
		<section className="border-b border-border bg-card">
			<div className="mx-auto max-w-7xl px-5 py-20 sm:px-8">
				<SectionHeading
					eyebrow="Compatibility"
					title="Works with your stack."
				/>
				<div className="grid gap-8 md:grid-cols-2">
					{groups.map(([group, items]) => (
						<div key={group}>
							<h3 className="mb-3 font-mono text-xs uppercase text-muted-foreground">
								{group}
							</h3>
							<div className="flex flex-wrap gap-2">
								{items.map((item) => (
									<span
										key={item}
										className="rounded-md border border-border bg-background px-3 py-2 text-sm"
									>
										{item}
									</span>
								))}
							</div>
						</div>
					))}
				</div>
			</div>
		</section>
	);
}
