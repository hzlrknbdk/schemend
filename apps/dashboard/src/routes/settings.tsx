import { createFileRoute } from "@tanstack/react-router";
import { Bell, Check, WalletCards } from "lucide-react";
import { useState } from "react";
import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import { PageHeader } from "@/components/dashboard/page-header";
import { Section } from "@/components/dashboard/section";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import {
	languageAdapters,
	notificationSettings,
	platforms,
} from "@/data/settings";

export const Route = createFileRoute("/settings")({
	head: () => ({
		meta: [
			{ title: "Settings — Schemend" },
			{
				name: "description",
				content:
					"Connected platforms, language adapters, budget, and notifications.",
			},
		],
	}),
	component: SettingsPage,
});

function SettingsPage() {
	const [saved, setSaved] = useState(false);
	return (
		<DashboardShell>
			<PageHeader
				title="Settings"
				description="Repository connections and agent preferences. Changes affect future runs only."
			/>
			<div className="grid grid-cols-2 gap-6">
				<Section
					title="Connected platforms"
					note="Read access and pull request permissions"
				>
					<div className="divide-y divide-border">
						{platforms.map(({ name, note, icon: Icon, connected }) => (
							<div key={name} className="flex items-center gap-3 px-5 py-4">
								<span className="flex size-9 items-center justify-center rounded-md border border-border bg-muted">
									<Icon className="size-4" />
								</span>
								<div>
									<p className="text-sm font-medium">{name}</p>
									<p className="text-xs text-muted-foreground">{note}</p>
								</div>
								<div className="ml-auto">
									{connected ? (
										<span className="flex items-center gap-1.5 text-xs text-success">
											<Check className="size-3.5" />
											Connected
										</span>
									) : (
										<Button variant="outline" size="sm">
											Connect
										</Button>
									)}
								</div>
							</div>
						))}
					</div>
				</Section>
				<Section title="Language adapters" note="Analysis and codemod support">
					<div className="divide-y divide-border">
						{languageAdapters.map(({ name, abbreviation, note }) => (
							<div key={name} className="flex items-center px-5 py-4">
								<span className="mr-3 flex size-9 items-center justify-center rounded-md bg-primary-soft font-mono text-xs text-primary">
									{abbreviation}
								</span>
								<div>
									<p className="text-sm font-medium">{name}</p>
									<p className="text-xs text-muted-foreground">{note}</p>
								</div>
								<Switch
									className="ml-auto"
									defaultChecked
									aria-label={`${name} adapter`}
								/>
							</div>
						))}
					</div>
				</Section>
				<Section
					title="Run configuration"
					note="Guardrails for agent execution"
				>
					<div className="space-y-5 p-5">
						<div className="block">
							<label
								htmlFor="budget-limit"
								className="mb-2 block text-xs font-medium"
							>
								Budget limit per run
							</label>
							<div className="relative">
								<span className="absolute left-3 top-2 text-sm text-muted-foreground">
									$
								</span>
								<Input
									id="budget-limit"
									defaultValue="5.00"
									className="pl-7 font-mono"
								/>
							</div>
							<span className="mt-1.5 block text-2xs text-muted-foreground">
								The run pauses before exceeding this amount.
							</span>
						</div>
						<div className="block">
							<label htmlFor="model" className="mb-2 block text-xs font-medium">
								Model
							</label>
							<Select defaultValue="sonnet">
								<SelectTrigger id="model">
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									<SelectItem value="sonnet">Claude Sonnet 4.5</SelectItem>
									<SelectItem value="gpt">GPT-5 Codex</SelectItem>
									<SelectItem value="auto">Automatic</SelectItem>
								</SelectContent>
							</Select>
						</div>
						<div className="flex items-center justify-between rounded-md border border-border p-3">
							<div>
								<p className="text-xs font-medium">
									Require passing tests before PR
								</p>
								<p className="mt-1 text-2xs text-muted-foreground">
									Otherwise mark the migration as failed.
								</p>
							</div>
							<Switch defaultChecked />
						</div>
					</div>
				</Section>
				<Section
					title="Notifications"
					note="Choose which agent events reach your team"
				>
					<div className="divide-y divide-border">
						{notificationSettings.map(({ name, note, enabledByDefault }) => (
							<div key={name} className="flex items-center px-5 py-4">
								<Bell className="mr-3 size-4 text-muted-foreground" />
								<div>
									<p className="text-xs font-medium">{name}</p>
									<p className="mt-0.5 text-2xs text-muted-foreground">
										{note}
									</p>
								</div>
								<Switch className="ml-auto" defaultChecked={enabledByDefault} />
							</div>
						))}
					</div>
				</Section>
			</div>
			<div className="mt-6 flex items-center justify-between rounded-lg border border-border bg-card px-5 py-4">
				<div className="flex items-center gap-3">
					<WalletCards className="size-4 text-muted-foreground" />
					<div>
						<p className="text-xs font-medium">Estimated monthly spend</p>
						<p className="font-mono text-sm">
							$46.18{" "}
							<span className="font-sans text-xs text-muted-foreground">
								of $100 budget
							</span>
						</p>
					</div>
				</div>
				<div className="flex items-center gap-3">
					{saved && (
						<span className="text-xs text-success">
							<Check className="mr-1 inline size-3" />
							Saved
						</span>
					)}
					<Button
						type="button"
						onClick={() => {
							setSaved(true);
							window.setTimeout(() => setSaved(false), 2000);
						}}
					>
						Save changes
					</Button>
				</div>
			</div>
		</DashboardShell>
	);
}
