import { cn } from "@schemend/ui";
import { ArrowRight, Server } from "lucide-react";
import { SectionHeading } from "@/components/section-heading";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

function MigrationDiagram() {
	const services = [
		["checkout-web", "TypeScript", "Tests passed"],
		["invoice-service", "Java", "Tests passed"],
		["notification-service", "C#", "Needs review"],
	];
	return (
		<div className="grid items-center gap-8 rounded-lg border border-border bg-background p-5 sm:p-8 lg:grid-cols-[280px_1fr] lg:gap-20">
			<div className="relative z-10 rounded-lg border-2 border-primary bg-card p-5">
				<div className="flex items-center gap-3">
					<span className="flex size-10 items-center justify-center rounded-md bg-primary-soft text-primary">
						<Server className="size-5" />
					</span>
					<div>
						<p className="font-semibold">orders-service</p>
						<p className="text-xs text-muted-foreground">Python · FastAPI</p>
					</div>
				</div>
				<div className="mt-5 border-t border-border pt-4 font-mono text-xs">
					<span>v2.8.1</span>
					<ArrowRight className="mx-2 inline size-3" />
					<span className="text-primary">v2.9.0</span>
				</div>
			</div>
			<div className="relative space-y-3 before:absolute before:bottom-full before:left-1/2 before:h-8 before:w-px before:bg-border lg:before:bottom-auto lg:before:left-auto lg:before:right-full lg:before:top-1/2 lg:before:h-px lg:before:w-20">
				<span className="migration-pulse absolute bottom-full left-1/2 size-2 -translate-x-1/2 rounded-full bg-primary lg:bottom-auto lg:right-full lg:top-1/2 lg:left-auto lg:-translate-y-1/2 lg:translate-x-0" />
				{services.map(([name, language, status]) => (
					<div
						key={name}
						className="relative flex items-center gap-4 rounded-md border border-border bg-card p-4"
					>
						<span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-muted font-mono text-3xs">
							{language === "TypeScript"
								? "TS"
								: language === "Java"
									? "JV"
									: "C#"}
						</span>
						<div className="min-w-0">
							<p className="truncate text-sm font-semibold">{name}</p>
							<p className="font-mono text-3xs text-muted-foreground">
								{language}
							</p>
						</div>
						<span
							className={cn(
								"ml-auto whitespace-nowrap text-xs",
								status === "Needs review" ? "text-warning" : "text-success",
							)}
						>
							{status === "Needs review" ? "△" : "✓"} {status}
						</span>
					</div>
				))}
			</div>
		</div>
	);
}

const codeDiffs = {
	typescript: ["- order.totalPrice", "+ order.total.amount"],
	java: ["- order.getTotalPrice()", "+ order.getTotal().getAmount()"],
	csharp: ["- order.TotalPrice", "+ order.Total.Amount"],
};

function LanguageDiff() {
	return (
		<Tabs defaultValue="typescript" className="mt-5">
			<TabsList className="h-10 rounded-md border border-border bg-muted">
				{Object.keys(codeDiffs).map((key) => (
					<TabsTrigger key={key} value={key} className="rounded-sm capitalize">
						{key === "csharp" ? "C#" : key}
					</TabsTrigger>
				))}
			</TabsList>
			{Object.entries(codeDiffs).map(([key, lines]) => (
				<TabsContent
					key={key}
					value={key}
					className="mt-3 overflow-x-auto rounded-lg border border-border bg-code p-5 font-mono text-sm leading-8"
				>
					<pre className="min-w-max">
						<span className="block text-danger">{lines[0]}</span>
						<span className="block text-success">{lines[1]}</span>
					</pre>
				</TabsContent>
			))}
		</Tabs>
	);
}

export function MultiLanguage() {
	return (
		<section className="border-b border-border bg-card">
			<div className="mx-auto max-w-7xl px-5 py-24 sm:px-8">
				<SectionHeading
					eyebrow="One change, three languages"
					title="One schema change. Three codebases. Three reviewable PRs."
					text="Schemend follows the changed field into each consumer and applies the language-specific fix."
				/>
				<MigrationDiagram />
				<LanguageDiff />
			</div>
		</section>
	);
}
