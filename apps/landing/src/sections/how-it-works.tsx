import { ArrowRight } from "lucide-react";
import { SectionHeading } from "@/components/section-heading";

const steps: [number: string, title: string, text: string][] = [
	[
		"01",
		"Discover",
		"Finds the internal and external APIs your services call.",
	],
	[
		"02",
		"Detect",
		"Compares old and new schemas and lists every breaking change.",
	],
	[
		"03",
		"Fix and verify",
		"Updates code, then builds and runs tests in an isolated container.",
	],
	[
		"04",
		"Review",
		"Opens one PR per service with each step and anything it could not verify.",
	],
];

export function HowItWorks() {
	return (
		<section id="how-it-works" className="scroll-mt-16 border-b border-border">
			<div className="mx-auto max-w-7xl px-5 py-20 sm:px-8">
				<SectionHeading
					eyebrow="How it works"
					title="From changed contract to reviewable pull request."
				/>
				<ol className="grid gap-8 lg:grid-cols-4">
					{steps.map(([number, title, text], i) => (
						<li key={number} className="relative border-t border-border pt-6">
							{i < 3 && (
								<ArrowRight className="absolute -right-5 -top-2 hidden size-4 bg-background px-0.5 text-muted-foreground lg:block" />
							)}
							<span className="font-mono text-xs text-primary">{number}</span>
							<h3 className="mt-5 font-semibold">{title}</h3>
							<p className="mt-2 text-sm leading-6 text-muted-foreground">
								{text}
							</p>
						</li>
					))}
				</ol>
			</div>
		</section>
	);
}
