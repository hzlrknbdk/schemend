import { createFileRoute, Link } from "@tanstack/react-router";
import {
	ArrowRight,
	Cable,
	Check,
	CheckCircle2,
	Clipboard,
	ExternalLink,
	Github,
	Menu,
	Moon,
	Play,
	Server,
	ShieldCheck,
	Sun,
} from "lucide-react";
import { useEffect, useState } from "react";
import {
	Accordion,
	AccordionContent,
	AccordionItem,
	AccordionTrigger,
} from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
import {
	Sheet,
	SheetClose,
	SheetContent,
	SheetHeader,
	SheetTitle,
	SheetTrigger,
} from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/")({
	head: () => ({
		meta: [
			{ title: "Schemend — API migrations, fixed in your CI" },
			{
				name: "description",
				content:
					"Open-source CI agent that finds code affected by API changes, fixes TypeScript, Java and C# services, and opens pull requests for review.",
			},
			{
				property: "og:title",
				content: "Schemend — API migrations, fixed in your CI",
			},
			{
				property: "og:description",
				content:
					"Find affected code, apply verified fixes, and review one pull request per service.",
			},
			{ property: "og:type", content: "website" },
			{ name: "twitter:card", content: "summary_large_image" },
		],
	}),
	component: LandingPage,
});

const githubUrl = "https://github.com/hzlrknbdk/schemend";
const readmeUrl = "https://github.com/hzlrknbdk/schemend#readme";
// @schemend/dashboard is a separate deployment (demo build), not a route of this app.
const dashboardUrl =
	import.meta.env.VITE_DASHBOARD_URL ?? "https://demo.schemend.dev";

interface CopyCommandProps {
	command: string;
}

function CopyCommand({ command }: CopyCommandProps) {
	const [isCopied, setIsCopied] = useState(false);
	const copy = async () => {
		await navigator.clipboard.writeText(command);
		setIsCopied(true);
		window.setTimeout(() => setIsCopied(false), 1600);
	};
	return (
		<div className="flex w-full min-w-0 max-w-full items-center justify-between gap-4 overflow-hidden rounded-md border border-border bg-code px-4 py-3 text-code-foreground">
			<code className="min-w-0 overflow-x-auto whitespace-nowrap font-mono text-xs sm:text-sm">
				{command}
			</code>
			<Button
				variant="ghost"
				size="icon"
				onClick={copy}
				aria-label={`Copy ${command}`}
				className="shrink-0 text-code-foreground hover:bg-sidebar-accent hover:text-sidebar-foreground"
			>
				{isCopied ? <Check /> : <Clipboard />}
			</Button>
		</div>
	);
}

function ThemeToggle() {
	const [isDark, setIsDark] = useState(false);
	useEffect(() => {
		setIsDark(document.documentElement.classList.contains("dark"));
	}, []);
	const toggle = () => {
		const next = !isDark;
		setIsDark(next);
		document.documentElement.classList.toggle("dark", next);
	};
	return (
		<Button
			variant="ghost"
			size="icon"
			onClick={toggle}
			aria-label={isDark ? "Use light mode" : "Use dark mode"}
		>
			{isDark ? <Sun /> : <Moon />}
		</Button>
	);
}

const navLinks = [
	{ label: "How it works", href: "#how-it-works" },
	{ label: "Demo", href: dashboardUrl },
	{ label: "Docs", href: readmeUrl },
];

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

function Brand() {
	return (
		<Link to="/" className="flex items-center gap-2.5 font-semibold">
			<span className="flex size-8 items-center justify-center rounded-md bg-primary text-primary-foreground">
				<Cable className="size-4" />
			</span>
			<span className="text-lg">Schemend</span>
		</Link>
	);
}

function LandingPage() {
	return (
		<div className="min-h-screen bg-background text-foreground">
			<header className="sticky top-0 z-40 border-b border-border bg-background/95 backdrop-blur">
				<div className="mx-auto flex h-16 max-w-7xl items-center px-5 sm:px-8">
					<Brand />
					<nav
						className="ml-auto hidden items-center gap-1 md:flex"
						aria-label="Primary navigation"
					>
						<Button asChild variant="ghost" size="sm">
							<a href="#how-it-works">How it works</a>
						</Button>
						<Button asChild variant="ghost" size="sm">
							<a href={dashboardUrl} target="_blank" rel="noreferrer">
								Demo
							</a>
						</Button>
						<Button asChild variant="ghost" size="sm">
							<a href={readmeUrl} target="_blank" rel="noreferrer">
								Docs
							</a>
						</Button>
						<Button asChild variant="outline" size="sm">
							<a href={githubUrl} target="_blank" rel="noreferrer">
								<Github />
								GitHub{" "}
								<span className="font-mono text-3xs text-muted-foreground">
									★ —
								</span>
							</a>
						</Button>
						<ThemeToggle />
					</nav>
					<div className="ml-auto flex items-center gap-1 md:hidden">
						<ThemeToggle />
						<Sheet>
							<SheetTrigger asChild>
								<Button variant="ghost" size="icon" aria-label="Open menu">
									<Menu />
								</Button>
							</SheetTrigger>
							<SheetContent>
								<SheetHeader>
									<SheetTitle>
										<Brand />
									</SheetTitle>
								</SheetHeader>
								<nav className="mt-8 flex flex-col gap-2">
									{navLinks.map((item) => (
										<SheetClose asChild key={item.label}>
											<a
												href={item.href}
												target={
													item.href.startsWith("#") ? undefined : "_blank"
												}
												rel={
													item.href.startsWith("#") ? undefined : "noreferrer"
												}
												className="rounded-md px-3 py-3 text-sm font-medium hover:bg-muted"
											>
												{item.label}
											</a>
										</SheetClose>
									))}
									<Button asChild className="mt-3">
										<a href={githubUrl} target="_blank" rel="noreferrer">
											<Github />
											GitHub
										</a>
									</Button>
								</nav>
							</SheetContent>
						</Sheet>
					</div>
				</div>
			</header>

			<main>
				<section className="border-b border-border">
					<div className="mx-auto grid max-w-7xl gap-14 px-5 py-20 sm:px-8 lg:grid-cols-[1fr_0.9fr] lg:items-center lg:py-28">
						<div>
							<p className="mb-5 font-mono text-xs font-medium uppercase text-primary">
								Open-source · runs in your CI
							</p>
							<h1 className="max-w-3xl text-4xl font-semibold leading-[1.08] sm:text-5xl lg:text-6xl">
								Your API changed. Your services update themselves.
							</h1>
							<p className="mt-6 max-w-2xl text-lg leading-8 text-muted-foreground">
								An open-source AI agent that finds code affected by API changes,
								fixes it across TypeScript, Java and C# services, and opens a
								pull request you review.
							</p>
							<div className="mt-8 flex flex-wrap gap-3">
								<Button asChild size="lg">
									<a href={dashboardUrl} target="_blank" rel="noreferrer">
										Try the live demo <ArrowRight />
									</a>
								</Button>
								<Button asChild size="lg" variant="outline">
									<a href={githubUrl} target="_blank" rel="noreferrer">
										<Github />
										View on GitHub
									</a>
								</Button>
							</div>
							<div className="mt-8 max-w-lg">
								<CopyCommand command="pnpm dlx schemend init" />
							</div>
						</div>
						<DemoPoster />
					</div>
				</section>

				<section className="border-b border-border">
					<div className="mx-auto max-w-7xl px-5 py-20 sm:px-8">
						<SectionHeading
							eyebrow="The problem"
							title="Version alerts stop before the actual work starts."
						/>
						<div className="grid gap-px overflow-hidden rounded-lg border border-border bg-border md:grid-cols-3">
							{[
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
							].map(([number, title, text]) => (
								<div key={number} className="bg-card p-7">
									<span className="font-mono text-xs text-primary">
										{number}
									</span>
									<h3 className="mt-7 text-base font-semibold">{title}</h3>
									<p className="mt-3 text-sm leading-6 text-muted-foreground">
										{text}
									</p>
								</div>
							))}
						</div>
					</div>
				</section>

				<section
					id="how-it-works"
					className="scroll-mt-16 border-b border-border"
				>
					<div className="mx-auto max-w-7xl px-5 py-20 sm:px-8">
						<SectionHeading
							eyebrow="How it works"
							title="From changed contract to reviewable pull request."
						/>
						<ol className="grid gap-8 lg:grid-cols-4">
							{[
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
							].map(([number, title, text], i) => (
								<li
									key={number}
									className="relative border-t border-border pt-6"
								>
									{i < 3 && (
										<ArrowRight className="absolute -right-5 -top-2 hidden size-4 bg-background px-0.5 text-muted-foreground lg:block" />
									)}
									<span className="font-mono text-xs text-primary">
										{number}
									</span>
									<h3 className="mt-5 font-semibold">{title}</h3>
									<p className="mt-2 text-sm leading-6 text-muted-foreground">
										{text}
									</p>
								</li>
							))}
						</ol>
					</div>
				</section>

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
							<h3 className="mt-5 text-sm font-semibold">
								notification-service
							</h3>
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

				<section className="border-b border-border">
					<div className="mx-auto max-w-7xl px-5 py-20 sm:px-8">
						<SectionHeading
							eyebrow="Evaluation"
							title="Measured on real migration scenarios."
						/>
						<div className="grid gap-px overflow-hidden rounded-lg border border-border bg-border sm:grid-cols-3">
							{[
								["[X]", "scenarios tested"],
								["[A]", "correct fixes"],
								["[B]", "correctly flagged for review"],
							].map(([value, label]) => (
								<div key={label} className="bg-card p-8">
									<p className="font-mono text-3xl font-semibold">{value}</p>
									<p className="mt-2 text-sm text-muted-foreground">{label}</p>
								</div>
							))}
						</div>
						<div className="mt-7 flex flex-col justify-between gap-4 text-sm text-muted-foreground sm:flex-row sm:items-center">
							<p>
								Includes real migrations: Firebase Cloud Messaging, AWS SDK v2
								to v3, Google Maps.
							</p>
							<a
								href={`${githubUrl}/tree/main/eval`}
								target="_blank"
								rel="noreferrer"
								className="inline-flex items-center gap-1 font-medium text-primary hover:underline"
							>
								See the full evaluation <ExternalLink className="size-3.5" />
							</a>
						</div>
					</div>
				</section>

				<section className="border-b border-border bg-card">
					<div className="mx-auto max-w-7xl px-5 py-20 sm:px-8">
						<SectionHeading
							eyebrow="Compatibility"
							title="Works with your stack."
						/>
						<div className="grid gap-8 md:grid-cols-2">
							{[
								["Languages", ["TypeScript", "Java", "C#"]],
								[
									"Platforms",
									["GitHub", "GitLab", "Bitbucket", "Azure DevOps"],
								],
								["Schemas", ["OpenAPI (REST)", "External SDK migrations"]],
								["Runs as", ["npm CLI", "Docker image", "Any CI"]],
							].map(([group, items]) => (
								<div key={group as string}>
									<h3 className="mb-3 font-mono text-xs uppercase text-muted-foreground">
										{group as string}
									</h3>
									<div className="flex flex-wrap gap-2">
										{(items as string[]).map((item) => (
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

				<section className="border-b border-border">
					<div className="mx-auto max-w-7xl px-5 py-20 sm:px-8">
						<SectionHeading
							eyebrow="Security and cost"
							title="Your code stays under your control."
						/>
						<div className="grid gap-8 md:grid-cols-3">
							{[
								[
									"Runs in your CI",
									"The agent executes inside infrastructure you already control.",
								],
								[
									"Minimal context",
									"Only affected code snippets are sent to the model API.",
								],
								[
									"Your key, your limit",
									"Use your own API key, set a per-run budget, and get a cost report in every PR.",
								],
							].map(([title, text]) => (
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

				<section className="bg-sidebar text-sidebar-foreground">
					<div className="mx-auto max-w-7xl px-5 py-20 sm:px-8">
						<h2 className="max-w-2xl text-3xl font-semibold sm:text-4xl">
							Try it on your own services.
						</h2>
						<p className="mt-4 max-w-2xl text-sm leading-7 text-sidebar-muted">
							Start with the read-only demo, then run a local impact check
							against your repositories.
						</p>
						<div className="mt-8 flex flex-wrap gap-3">
							<Button asChild size="lg">
								<a href={dashboardUrl} target="_blank" rel="noreferrer">
									Try the live demo <ArrowRight />
								</a>
							</Button>
							<Button
								asChild
								size="lg"
								variant="outline"
								className="border-sidebar-border bg-sidebar text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
							>
								<a href={githubUrl} target="_blank" rel="noreferrer">
									<Github />
									View on GitHub
								</a>
							</Button>
						</div>
					</div>
				</section>
			</main>

			<footer className="border-t border-sidebar-border bg-sidebar text-sidebar-muted">
				<div className="mx-auto flex max-w-7xl flex-col gap-4 px-5 py-8 text-xs sm:flex-row sm:items-center sm:justify-between sm:px-8">
					<p>
						Built by{" "}
						<span className="text-sidebar-foreground">Hazal Ruken Budak</span>
					</p>
					<div className="flex gap-5">
						<span>MIT License</span>
						<a
							href="https://www.npmjs.com"
							target="_blank"
							rel="noreferrer"
							className="hover:text-sidebar-foreground"
						>
							npm
						</a>
						<a
							href={githubUrl}
							target="_blank"
							rel="noreferrer"
							className="hover:text-sidebar-foreground"
						>
							GitHub
						</a>
					</div>
				</div>
			</footer>
		</div>
	);
}

interface SectionHeadingProps {
	eyebrow: string;
	title: string;
	text?: string;
}

function SectionHeading({ eyebrow, title, text }: SectionHeadingProps) {
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

function DemoPoster() {
	return (
		<div className="relative overflow-hidden rounded-lg border border-border bg-card shadow-sm">
			<div className="flex h-10 items-center gap-2 border-b border-border px-4">
				<span className="size-2.5 rounded-full bg-danger" />
				<span className="size-2.5 rounded-full bg-warning" />
				<span className="size-2.5 rounded-full bg-success" />
				<span className="ml-2 font-mono text-3xs text-muted-foreground">
					app.schemend.dev/impact
				</span>
			</div>
			<div className="aspect-video p-4 sm:p-5">
				<div className="flex h-full gap-3">
					<div className="hidden w-24 shrink-0 rounded bg-sidebar p-3 sm:block">
						<div className="h-2 w-12 rounded bg-sidebar-primary" />
						<div className="mt-5 space-y-3">
							{[1, 2, 3, 4, 5].map((i) => (
								<div key={i} className="h-1.5 rounded bg-sidebar-border" />
							))}
						</div>
					</div>
					<div className="min-w-0 flex-1">
						<p className="font-mono text-4xs uppercase text-primary">
							Run #run_8f3a2c
						</p>
						<h3 className="mt-1 text-xs font-semibold sm:text-sm">
							orders-service schema changed
						</h3>
						<div className="mt-4 grid h-[65%] grid-cols-[0.75fr_1fr] items-center gap-5">
							<div className="rounded border-2 border-primary bg-background p-3">
								<Server className="size-4 text-primary" />
								<p className="mt-2 text-3xs font-semibold">orders-service</p>
								<p className="font-mono text-5xs text-muted-foreground">
									v2.8.1 → v2.9.0
								</p>
							</div>
							<div className="space-y-2">
								{[
									["checkout-web", "Passed"],
									["invoice-service", "Passed"],
									["notification-service", "Review"],
								].map(([name, status]) => (
									<div
										key={name}
										className="flex items-center justify-between rounded border border-border bg-background p-2"
									>
										<span className="truncate text-4xs font-medium">
											{name}
										</span>
										<span
											className={cn(
												"font-mono text-6xs",
												status === "Review" ? "text-warning" : "text-success",
											)}
										>
											{status}
										</span>
									</div>
								))}
							</div>
						</div>
					</div>
				</div>
			</div>
			<a
				href={dashboardUrl}
				target="_blank"
				rel="noreferrer"
				aria-label="Open impact demo"
				className="absolute inset-0 flex items-center justify-center bg-foreground/0 transition-colors hover:bg-foreground/5"
			>
				<span className="flex size-12 items-center justify-center rounded-full bg-primary text-primary-foreground shadow">
					<Play className="ml-0.5 size-5" fill="currentColor" />
				</span>
			</a>
		</div>
	);
}

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
