import { CopyCommand } from "@/components/copy-command";
import { SectionHeading } from "@/components/section-heading";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

function CiExample() {
	return (
		<Tabs defaultValue="github">
			<TabsList className="rounded-md border border-border">
				<TabsTrigger value="github">GitHub Actions</TabsTrigger>
				<TabsTrigger value="gitlab">GitLab CI</TabsTrigger>
			</TabsList>
			<TabsContent
				value="github"
				className="overflow-x-auto rounded-md border border-border bg-code p-5"
			>
				<pre className="font-mono text-xs leading-6 text-code-foreground">{`- uses: schemend/action@v1\n  with:\n    command: check\n    budget: 5.00`}</pre>
			</TabsContent>
			<TabsContent
				value="gitlab"
				className="overflow-x-auto rounded-md border border-border bg-code p-5"
			>
				<pre className="font-mono text-xs leading-6 text-code-foreground">{`schemend:\n  image: schemend/cli:latest\n  script:\n    - schemend check`}</pre>
			</TabsContent>
		</Tabs>
	);
}

export function QuickStart() {
	return (
		<section className="border-b border-border bg-card">
			<div className="mx-auto max-w-7xl px-5 py-20 sm:px-8">
				<SectionHeading
					eyebrow="Quick start"
					title="Inspect the impact before anything changes."
				/>
				<div className="grid gap-8 lg:grid-cols-2">
					<div className="min-w-0 space-y-3">
						<CopyCommand command="pnpm dlx schemend init   # discovers APIs and writes schemend.config.ts" />
						<CopyCommand command="pnpm dlx schemend check  # dry run, shows impact and proposed fixes" />
					</div>
					<div className="min-w-0">
						<CiExample />
					</div>
				</div>
			</div>
		</section>
	);
}
