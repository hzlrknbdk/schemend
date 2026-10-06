import { createFileRoute } from "@tanstack/react-router";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { Compatibility } from "@/sections/compatibility";
import { Cta } from "@/sections/cta";
import { Evaluation } from "@/sections/evaluation";
import { ExplicitUncertainty } from "@/sections/explicit-uncertainty";
import { Faq } from "@/sections/faq";
import { Hero } from "@/sections/hero";
import { HowItWorks } from "@/sections/how-it-works";
import { MultiLanguage } from "@/sections/multi-language";
import { Problem } from "@/sections/problem";
import { QuickStart } from "@/sections/quick-start";
import { SecurityAndCost } from "@/sections/security-and-cost";

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

function LandingPage() {
	return (
		<div className="min-h-screen bg-background text-foreground">
			<SiteHeader />
			<main>
				<Hero />
				<Problem />
				<HowItWorks />
				<MultiLanguage />
				<ExplicitUncertainty />
				<Evaluation />
				<Compatibility />
				<SecurityAndCost />
				<QuickStart />
				<Faq />
				<Cta />
			</main>
			<SiteFooter />
		</div>
	);
}
