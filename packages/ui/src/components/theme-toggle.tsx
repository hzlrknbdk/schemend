import { Monitor, Moon, Sun } from "lucide-react";
import { useEffect, useState } from "react";
import {
	applyTheme,
	getStoredTheme,
	setStoredTheme,
	type ThemeMode,
} from "../lib/theme";
import { Button } from "../vendor/button";

const nextMode: Record<ThemeMode, ThemeMode> = {
	system: "light",
	light: "dark",
	dark: "system",
};

const modeIcon: Record<ThemeMode, typeof Sun> = {
	system: Monitor,
	light: Sun,
	dark: Moon,
};

const switchToLabel: Record<ThemeMode, string> = {
	system: "Switch to light theme",
	light: "Switch to dark theme",
	dark: "Switch to system theme",
};

export interface ThemeToggleProps {
	className?: string | undefined;
}

export function ThemeToggle({ className }: ThemeToggleProps) {
	const [mode, setMode] = useState<ThemeMode>("system");

	useEffect(() => {
		setMode(getStoredTheme());
	}, []);

	useEffect(() => {
		if (mode !== "system") return;
		const media = window.matchMedia("(prefers-color-scheme: dark)");
		const handleChange = () => applyTheme("system");
		media.addEventListener("change", handleChange);
		return () => media.removeEventListener("change", handleChange);
	}, [mode]);

	const Icon = modeIcon[mode];

	return (
		<Button
			variant="ghost"
			size="icon"
			className={className}
			onClick={() => {
				const next = nextMode[mode];
				setMode(next);
				setStoredTheme(next);
			}}
			aria-label={switchToLabel[mode]}
		>
			<Icon />
		</Button>
	);
}
