import type { LanguageAdapter } from "@schemend/core";
import { build, test } from "./checks.js";
import { detect, discoverApis, regenerateClient } from "./discover.js";
import { findAffected } from "./impact.js";

/** TypeScript LanguageAdapter (SPEC §4); wires together this package's individually-tested pieces. */
export const typescriptAdapter: LanguageAdapter = {
	id: "typescript",
	detect,
	discoverApis,
	regenerateClient,
	findAffected,
	build,
	test,
};
