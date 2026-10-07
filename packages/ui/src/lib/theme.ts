export type ThemeMode = "system" | "light" | "dark";

const STORAGE_KEY = "schemend-theme";

function prefersDark(): boolean {
	return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

function isDarkMode(mode: ThemeMode): boolean {
	return mode === "dark" || (mode === "system" && prefersDark());
}

export function applyTheme(mode: ThemeMode): void {
	document.documentElement.classList.toggle("dark", isDarkMode(mode));
}

export function getStoredTheme(): ThemeMode {
	try {
		const stored = localStorage.getItem(STORAGE_KEY);
		if (stored === "light" || stored === "dark" || stored === "system") {
			return stored;
		}
	} catch {
		// localStorage unavailable (private mode, blocked storage): fall back to system.
	}
	return "system";
}

export function setStoredTheme(mode: ThemeMode): void {
	try {
		localStorage.setItem(STORAGE_KEY, mode);
	} catch {
		// localStorage unavailable: theme still applies for this page load, just won't persist.
	}
	applyTheme(mode);
}

/** Inlined in <head> before any stylesheet to avoid a flash of the wrong theme; keep static so it stays CSP-hashable later. */
export const themeInitScript = `(function(){try{var m=localStorage.getItem("${STORAGE_KEY}");var d=m==="dark"||(m!=="light"&&matchMedia("(prefers-color-scheme: dark)").matches);if(d)document.documentElement.classList.add("dark")}catch(e){}})();`;
