import { createFileRoute } from "@tanstack/react-router";
import {
	AlertTriangle,
	Check,
	Coins,
	ExternalLink,
	GitBranch,
} from "lucide-react";
import { useState } from "react";
import {
	DashboardShell,
	PageHeader,
	Section,
	StatusBadge,
} from "@/components/schemend/dashboard-shell";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/demo/migration")({
	head: () => ({
		meta: [
			{ title: "Migration Detail — Schemend" },
			{
				name: "description",
				content:
					"Review the generated checkout-web migration and verification results.",
			},
			{ property: "og:title", content: "Migration Detail — Schemend" },
			{
				property: "og:description",
				content:
					"Review the generated checkout-web migration and verification results.",
			},
			{ property: "og:type", content: "website" },
			{ name: "twitter:card", content: "summary_large_image" },
		],
	}),
	component: Migration,
});
const files = [
	"src/lib/orders.ts",
	"src/components/OrderTotal.tsx",
	"src/types/order.ts",
];
const diffs: Record<string, { type: string; text: string }[]> = {
	"src/lib/orders.ts": [
		{
			type: "context",
			text: " export function formatOrderTotal(order: OrderResponse) {",
		},
		{ type: "remove", text: "-  return formatCurrency(order.totalPrice);" },
		{ type: "add", text: "+  return formatCurrency(" },
		{ type: "add", text: "+    order.total.amount," },
		{ type: "add", text: "+    order.total.currency" },
		{ type: "add", text: "+  );" },
		{ type: "context", text: " }" },
		{ type: "context", text: "" },
		{
			type: "context",
			text: " export function getOrderSummary(order: OrderResponse) {",
		},
		{ type: "remove", text: "-  const amount = order.totalPrice;" },
		{ type: "add", text: "+  const { amount, currency } = order.total;" },
		{ type: "context", text: "   return {" },
		{ type: "context", text: "     id: order.id," },
		{ type: "remove", text: "-    amount," },
		{ type: "add", text: "+    amount," },
		{ type: "add", text: "+    currency," },
		{ type: "context", text: "   };" },
		{ type: "context", text: " }" },
	],
	"src/components/OrderTotal.tsx": [
		{
			type: "context",
			text: " export function OrderTotal({ order }: Props) {",
		},
		{
			type: "remove",
			text: "-  const display = `$${order.totalPrice.toFixed(2)}`;",
		},
		{
			type: "add",
			text: "+  const display = new Intl.NumberFormat(undefined, {",
		},
		{ type: "add", text: "+    style: 'currency'," },
		{ type: "add", text: "+    currency: order.total.currency," },
		{ type: "add", text: "+  }).format(order.total.amount);" },
		{ type: "context", text: "   return <span>{display}</span>;" },
		{ type: "context", text: " }" },
	],
	"src/types/order.ts": [
		{ type: "context", text: " export interface OrderResponse {" },
		{ type: "context", text: "   id: string;" },
		{ type: "remove", text: "-  totalPrice: number;" },
		{ type: "add", text: "+  total: {" },
		{ type: "add", text: "+    amount: number;" },
		{ type: "add", text: "+    currency: string;" },
		{ type: "add", text: "+  };" },
		{ type: "context", text: " }" },
	],
};
function Migration() {
	const [file, setFile] = useState<string>("src/lib/orders.ts");
	const selectedDiff = diffs[file] ?? [];
	return (
		<DashboardShell>
			<PageHeader
				eyebrow="orders-service migration"
				title="checkout-web"
				description="TypeScript · Next.js 15 · 6 files changed"
				action={
					<Button asChild>
						<a href="https://github.com" target="_blank" rel="noreferrer">
							Review on GitHub <ExternalLink />
						</a>
					</Button>
				}
			/>
			<div className="mb-6 flex items-center gap-3 rounded-lg border border-border bg-card px-5 py-3 text-xs">
				<GitBranch className="size-4 text-muted-foreground" />
				<span className="text-muted-foreground">Branch</span>
				<code className="font-mono">schemend/orders-v2.9.0</code>
				<span className="ml-auto">
					<StatusBadge status="PR #184 opened" />
				</span>
			</div>
			<div className="grid grid-cols-[minmax(0,1fr)_320px] gap-6">
				<div className="space-y-6">
					<Section
						title="Steps applied"
						note="Generated from schema diff and repository context"
					>
						<ol className="grid grid-cols-4 divide-x divide-border">
							{[
								"Updated OrderResponse type",
								"Replaced totalPrice reads",
								"Added currency formatting",
								"Updated affected tests",
							].map((step, i) => (
								<li key={step} className="p-4">
									<span className="flex size-6 items-center justify-center rounded-full bg-success-soft text-xs font-semibold text-success">
										{i + 1}
									</span>
									<p className="mt-3 text-xs leading-5">{step}</p>
								</li>
							))}
						</ol>
					</Section>
					<Section title="Code changes" note="3 of 6 changed files shown">
						<div className="flex border-b border-border bg-muted/40">
							{files.map((name) => (
								<button
									key={name}
									type="button"
									onClick={() => setFile(name)}
									className={cn(
										"border-r border-border px-4 py-3 font-mono text-[11px] text-muted-foreground",
										file === name &&
											"bg-card text-foreground shadow-[inset_0_-2px_0_var(--primary)]",
									)}
								>
									{name.split("/").pop()}
								</button>
							))}
						</div>
						<div className="overflow-hidden bg-code py-3 font-mono text-xs leading-6">
							{selectedDiff.map((line, i) => (
								<div
									// biome-ignore lint/suspicious/noArrayIndexKey: static diff lines, order never changes
									key={`${line.text}-${i}`}
									className={cn(
										"grid grid-cols-[42px_1fr] px-3",
										line.type === "remove" && "bg-danger-soft text-danger",
										line.type === "add" && "bg-success-soft text-success",
										line.type === "context" && "text-code-foreground",
									)}
								>
									<span className="select-none text-right text-muted-foreground/60">
										{i + 18}
									</span>
									<pre className="pl-4">{line.text || " "}</pre>
								</div>
							))}
						</div>
					</Section>
				</div>
				<div className="space-y-6">
					<Section title="Verification">
						<div className="divide-y divide-border">
							{[
								["Build", "Passed"],
								["Typecheck", "Passed"],
								["Lint", "Passed"],
								["Tests", "48 / 48"],
							].map(([label, value]) => (
								<div
									key={label}
									className="flex items-center justify-between px-4 py-3 text-xs"
								>
									<span>{label}</span>
									<span className="flex items-center gap-1.5 font-mono text-success">
										<Check className="size-3.5" />
										{value}
									</span>
								</div>
							))}
						</div>
						<div className="border-t border-border bg-muted/40 px-4 py-3 text-xs text-muted-foreground">
							Coverage remained at{" "}
							<strong className="text-foreground">87.2%</strong> (+0.1%)
						</div>
					</Section>
					<div className="rounded-lg border border-warning/35 bg-warning-soft p-5">
						<AlertTriangle className="size-5 text-warning" />
						<h2 className="mt-3 text-sm font-semibold">Needs your review</h2>
						<p className="mt-2 text-xs leading-5 text-muted-foreground">
							One fallback formats missing currency as USD. The schema marks
							currency required, but historical fixtures contain null values.
							Confirm USD is the correct fallback before merging.
						</p>
						<div className="mt-4 border-t border-warning/20 pt-3 font-mono text-[11px] text-warning">
							src/lib/orders.ts:42
						</div>
					</div>
					<Section title="Run cost">
						<div className="p-5">
							<div className="flex items-center gap-3">
								<Coins className="size-4 text-muted-foreground" />
								<div>
									<p className="font-mono text-lg font-semibold">$0.64</p>
									<p className="text-[11px] text-muted-foreground">estimated</p>
								</div>
							</div>
							<dl className="mt-4 space-y-2 border-t border-border pt-4 text-xs">
								<div className="flex justify-between">
									<dt className="text-muted-foreground">Input tokens</dt>
									<dd className="font-mono">142,804</dd>
								</div>
								<div className="flex justify-between">
									<dt className="text-muted-foreground">Output tokens</dt>
									<dd className="font-mono">18,392</dd>
								</div>
								<div className="flex justify-between">
									<dt className="text-muted-foreground">Duration</dt>
									<dd className="font-mono">2m 06s</dd>
								</div>
							</dl>
						</div>
					</Section>
				</div>
			</div>
		</DashboardShell>
	);
}
