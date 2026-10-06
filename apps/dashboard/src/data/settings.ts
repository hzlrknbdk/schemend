import { Box, Code2, Github, Gitlab, type LucideIcon } from "lucide-react";

export interface Platform {
	name: string;
	note: string;
	icon: LucideIcon;
	isConnected: boolean;
}

export const platforms: Platform[] = [
	{ name: "GitHub", note: "14 repositories", icon: Github, isConnected: true },
	{
		name: "GitLab",
		note: "Not connected",
		icon: Gitlab,
		isConnected: false,
	},
	{
		name: "Bitbucket",
		note: "Not connected",
		icon: Box,
		isConnected: false,
	},
	{
		name: "Azure DevOps",
		note: "Not connected",
		icon: Code2,
		isConnected: false,
	},
];

export interface LanguageAdapter {
	name: string;
	abbreviation: string;
	note: string;
}

export const languageAdapters: LanguageAdapter[] = [
	{
		name: "TypeScript",
		abbreviation: "TS",
		note: "TypeScript 5.x · Node.js 20+",
	},
	{ name: "Java", abbreviation: "JV", note: "Java 17–23 · Maven and Gradle" },
	{ name: "C#", abbreviation: "C#", note: ".NET 8 and 9 · NuGet" },
];

export interface NotificationSetting {
	name: string;
	note: string;
	isEnabledByDefault: boolean;
}

export const notificationSettings: NotificationSetting[] = [
	{
		name: "Pull request opened",
		note: "When schemend creates a migration PR",
		isEnabledByDefault: true,
	},
	{
		name: "Manual review required",
		note: "When confidence falls below the threshold",
		isEnabledByDefault: true,
	},
	{
		name: "Run failed",
		note: "When build or tests do not pass",
		isEnabledByDefault: true,
	},
	{
		name: "Run completed",
		note: "For every successful migration",
		isEnabledByDefault: false,
	},
];
