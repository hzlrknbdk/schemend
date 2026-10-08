declare const __SCHEMEND_ENV__: {
	VITE_SCHEMEND_MODE: "demo" | "local";
	VITE_LANDING_URL: string;
	VITE_MOCK_SCENARIO:
		| "default"
		| "empty"
		| "network-error"
		| "not-found-error"
		| "server-error"
		| "validation-error"
		| "slow";
};

/**
 * Validated with zod in vite.config.ts at build/dev-server start, then inlined as a literal by
 * Vite's `define`. This is the only place in the app that touches the result — no other file
 * reads `import.meta.env` directly, and zod itself never ships in the client bundle.
 */
export const env = __SCHEMEND_ENV__;
