import { SectionHeading } from "@/components/section-heading";
import {
	Accordion,
	AccordionContent,
	AccordionItem,
	AccordionTrigger,
} from "@/components/ui/accordion";

const faqs: [question: string, answer: string][] = [
	[
		"Does this replace API versioning or contract testing?",
		"No. It handles the moment a breaking change is unavoidable or an old version is retired.",
	],
	[
		"Does it merge code automatically?",
		"Never. Every change is a pull request.",
	],
	[
		"What if my project has few tests?",
		"Fixes are then only verified at build level, and the PR says so.",
	],
	["Which languages are next?", "Go and Python consumers are on the roadmap."],
];

export function Faq() {
	return (
		<section className="border-b border-border">
			<div className="mx-auto max-w-3xl px-5 py-20 sm:px-8">
				<SectionHeading
					eyebrow="FAQ"
					title="Questions engineers usually ask."
				/>
				<Accordion type="single" collapsible>
					{faqs.map(([q, a]) => (
						<AccordionItem value={q} key={q}>
							<AccordionTrigger className="py-6 text-base hover:no-underline">
								{q}
							</AccordionTrigger>
							<AccordionContent className="max-w-2xl pb-6 leading-7 text-muted-foreground">
								{a}
							</AccordionContent>
						</AccordionItem>
					))}
				</Accordion>
			</div>
		</section>
	);
}
