import { ExternalLink } from "lucide-react";
import { SectionHeading } from "@/components/section-heading";
import { githubUrl } from "@/lib/links";

const stats: [value: string, label: string][] = [
	["[X]", "scenarios tested"],
	["[A]", "correct fixes"],
	["[B]", "correctly flagged for review"],
];

export function Evaluation() {
	return (
		<section className="border-b border-border">
			<div className="mx-auto max-w-7xl px-5 py-20 sm:px-8">
				<SectionHeading
					eyebrow="Evaluation"
					title="Measured on real migration scenarios."
				/>
				<div className="grid gap-px overflow-hidden rounded-lg border border-border bg-border sm:grid-cols-3">
					{stats.map(([value, label]) => (
						<div key={label} className="bg-card p-8">
							<p className="font-mono text-3xl font-semibold">{value}</p>
							<p className="mt-2 text-sm text-muted-foreground">{label}</p>
						</div>
					))}
				</div>
				<div className="mt-7 flex flex-col justify-between gap-4 text-sm text-muted-foreground sm:flex-row sm:items-center">
					<p>
						Includes real migrations: Firebase Cloud Messaging, AWS SDK v2 to
						v3, Google Maps.
					</p>
					<a
						href={`${githubUrl}/tree/main/eval`}
						target="_blank"
						rel="noopener noreferrer"
						className="inline-flex items-center gap-1 font-medium text-primary hover:underline"
					>
						See the full evaluation <ExternalLink className="size-3.5" />
					</a>
				</div>
			</div>
		</section>
	);
}
