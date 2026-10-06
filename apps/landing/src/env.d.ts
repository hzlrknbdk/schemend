/// <reference types="vite/client" />

interface ImportMetaEnv {
	/** Where "Try the live demo" points; @schemend/dashboard is a separate deployment. */
	readonly VITE_DASHBOARD_URL?: string;
}
