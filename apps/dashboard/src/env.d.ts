/// <reference types="vite/client" />

interface ImportMetaEnv {
	readonly VITE_SCHEMEND_MODE?: "demo" | "local";
	/** Where the "Back to schemend.dev" link points; the landing page is a separate deployment. */
	readonly VITE_LANDING_URL?: string;
}
