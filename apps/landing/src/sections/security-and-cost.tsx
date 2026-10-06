import { CheckCircle2 } from "lucide-react";
import { SectionHeading } from "@/components/section-heading";

const items: [title: string, text: string][] = [
	[
		"Runs in your CI",
		"The agent executes inside infrastructure you already control.",
	],
	["Minimal context", "Only affected code snippets are sent to the model API."],
	[
		"Your key, your limit",
		"Use your own API key, set a per-run budget, and get a cost report in every PR.",
	],
];

export function SecurityAndCost() {
	return (
		<section className="border-b border-border">
			<div className="mx-auto max-w-7xl px-5 py-20 sm:px-8">
				<SectionHeading
					eyebrow="Security and cost"
					title="Your code stays under your control."
				/>
				<div className="grid gap-8 md:grid-cols-3">
					{items.map(([title, text]) => (
						<div key={title} className="flex gap-4">
							<CheckCircle2 className="mt-0.5 size-5 shrink-0 text-success" />
							<div>
								<h3 className="font-semibold">{title}</h3>
								<p className="mt-2 text-sm leading-6 text-muted-foreground">
									{text}
								</p>
							</div>
						</div>
					))}
				</div>
			</div>
		</section>
	);
}
