import { Box, Code2, Github, Gitlab, type LucideIcon } from "lucide-react";

export type Platform = {
	name: string;
	note: string;
	icon: LucideIcon;
	connected: boolean;
};

export const platforms: Platform[] = [
	{ name: "GitHub", note: "14 repositories", icon: Github, connected: true },
	{ name: "GitLab", note: "Not connected", icon: Gitlab, connected: false },
	{ name: "Bitbucket", note: "Not connected", icon: Box, connected: false },
	{
		name: "Azure DevOps",
		note: "Not connected",
		icon: Code2,
		connected: false,
	},
];

export type LanguageAdapter = {
	name: string;
	abbreviation: string;
	note: string;
};

export const languageAdapters: LanguageAdapter[] = [
	{
		name: "TypeScript",
		abbreviation: "TS",
		note: "TypeScript 5.x · Node.js 20+",
	},
	{ name: "Java", abbreviation: "JV", note: "Java 17–23 · Maven and Gradle" },
	{ name: "C#", abbreviation: "C#", note: ".NET 8 and 9 · NuGet" },
];

export type NotificationSetting = {
	name: string;
	note: string;
	enabledByDefault: boolean;
};

export const notificationSettings: NotificationSetting[] = [
	{
		name: "Pull request opened",
		note: "When schemend creates a migration PR",
		enabledByDefault: true,
	},
	{
		name: "Manual review required",
		note: "When confidence falls below the threshold",
		enabledByDefault: true,
	},
	{
		name: "Run failed",
		note: "When build or tests do not pass",
		enabledByDefault: true,
	},
	{
		name: "Run completed",
		note: "For every successful migration",
		enabledByDefault: false,
	},
];
