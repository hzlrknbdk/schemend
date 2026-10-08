import { RootError, RootNotFound, themeInitScript } from "@schemend/ui";
import {
	createRootRoute,
	HeadContent,
	Outlet,
	Scripts,
} from "@tanstack/react-router";
import type { ReactNode } from "react";
import appCss from "../styles.css?url";

export const Route = createRootRoute({
	head: () => ({
		meta: [
			{ charSet: "utf-8" },
			{ name: "viewport", content: "width=device-width, initial-scale=1" },
			{ name: "author", content: "schemend" },
			{ name: "referrer", content: "strict-origin-when-cross-origin" },
		],
		links: [
			{
				rel: "stylesheet",
				href: appCss,
			},
			{ rel: "icon", href: "/favicon.ico", type: "image/x-icon" },
		],
	}),
	shellComponent: RootShell,
	component: RootComponent,
	notFoundComponent: RootNotFound,
	errorComponent: RootError,
});

interface RootShellProps {
	children: ReactNode;
}

function RootShell({ children }: RootShellProps) {
	return (
		<html lang="en">
			<head>
				{/* biome-ignore lint/security/noDangerouslySetInnerHtml: static script we authored, no user input */}
				<script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
				<HeadContent />
			</head>
			<body>
				{children}
				<Scripts />
			</body>
		</html>
	);
}

function RootComponent() {
	// Required: nested routes render here. Removing <Outlet /> breaks all child routes.
	return <Outlet />;
}
