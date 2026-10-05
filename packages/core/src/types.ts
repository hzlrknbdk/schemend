/** Where an ApiEntry's schema comes from: produced during discovery (SPEC §2 step 1). */
export type ApiSource =
	| { type: "openapi"; location: string }
	| {
			type: "package";
			ecosystem: "npm" | "maven" | "nuget";
			name: string;
			version: string;
	  };

/** An API a consumer project calls; produced by a LanguageAdapter's discoverApis(). */
export interface ApiEntry {
	name: string;
	kind: "internal" | "external";
	source: ApiSource;
	usedIn: string[];
	/** Why discovery flagged this API (script name, env var + file); shown during `schemend init`. */
	evidence?: string[];
}

/** oasdiff's own check id and raw numeric level (ERR=3, WARN=2, INFO=1, NONE=0), kept alongside our normalized id/severity. */
export interface OasdiffSource {
	tool: "oasdiff";
	id: string;
	level: number;
}

/** One schema difference between old and new API versions; produced by the oasdiff step (SPEC §2 step 2). */
export interface ApiChange {
	id: string;
	severity: "breaking" | "non-breaking";
	summary: string;
	target: string;
	source: OasdiffSource;
}

/** A spot in consumer code touched by an ApiChange; produced by a LanguageAdapter's findAffected(). */
export interface AffectedLocation {
	file: string;
	line: number;
	changeId: string;
	snippet: string;
}

/** A spot the agent could not fix or verify with confidence; produced during fix/verify, surfaced in the PR. */
export interface ReviewItem {
	file: string;
	reason: string;
}

/** The outcome of one build/test/check command; produced by a LanguageAdapter's build()/test(). */
export interface CheckResult {
	name: string;
	status: "passed" | "failed" | "skipped";
	detail?: string;
}

/** How sure schemend is that a fix is correct (SPEC §3); produced after verify, shown in the PR. */
export type Confidence =
	| "verified-by-tests"
	| "verified-by-build"
	| "unverified";

/** A PR/MR opened for a service's fix; the PlatformAdapter#openChangeRequest return value, kept once opened. */
export interface ChangeRequest {
	url: string;
	/** Not every platform's openChangeRequest result exposes a number (e.g. a bare URL). */
	number?: number;
}

/** The outcome of processing one consumer service end to end; produced once per service per run. */
export interface ServiceResult {
	service: string;
	language: string;
	branch: string;
	steps: string[];
	changedFiles: string[];
	checks: CheckResult[];
	review: ReviewItem[];
	confidence: Confidence;
	costUsd: number;
	/** Set once `schemend run` calls PlatformAdapter#openChangeRequest; absent for `schemend check` (local-only, never pushes). */
	changeRequest?: ChangeRequest;
	/** Unified diff of this service's branch against its base, so a local dashboard can show the change without calling out to the platform. */
	diff?: string;
}

/** What started this run: a schema change (internal API) or a dependency release (external SDK). */
export interface RunTrigger {
	type: "schema-change" | "package-release";
	detail: string;
}

/** The full result of one schemend run across all consumers; produced at the end of `schemend check`/`run`. */
export interface RunReport {
	api: string;
	startedAt: string;
	finishedAt: string;
	changes: ApiChange[];
	services: ServiceResult[];
	budgetUsd: number;
	spentUsd: number;
	stoppedReason?: string;
	trigger?: RunTrigger;
}
