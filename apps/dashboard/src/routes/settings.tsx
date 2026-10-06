import { createFileRoute } from "@tanstack/react-router";
import { SettingsPage } from "@/features/settings/settings-page";

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
