import { ShieldCheck } from "lucide-react";
import { SectionHeading } from "@/components/section-heading";

export function ExplicitUncertainty() {
	return (
		<section className="border-b border-border">
			<div className="mx-auto grid max-w-7xl gap-12 px-5 py-20 sm:px-8 lg:grid-cols-[0.8fr_1.2fr] lg:items-center">
				<SectionHeading
					eyebrow="Explicit uncertainty"
					title="It tells you what it didn't fix."
					text="The agent fixes structural changes and flags behavioral decisions for a person who knows the system."
				/>
				<div className="rounded-lg border border-warning/35 bg-warning-soft p-6">
					<div className="flex items-center gap-2 text-warning">
						<ShieldCheck className="size-5" />
						<span className="font-mono text-xs font-medium uppercase">
							Needs review
						</span>
					</div>
					<h3 className="mt-5 text-sm font-semibold">notification-service</h3>
					<p className="mt-2 text-sm leading-7 text-muted-foreground">
						The receipt template hardcodes the “TL” currency suffix. The new
						currency field may differ. No test covers this template.
					</p>
					<div className="mt-5 border-t border-warning/20 pt-4 font-mono text-xs text-warning">
						Confidence 76% · no change applied
					</div>
				</div>
			</div>
		</section>
	);
}
