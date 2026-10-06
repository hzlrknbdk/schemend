import type {
	ApiChange,
	ApiEntry,
	ApiSource,
	ChangeRequest,
	CheckResult,
	Confidence,
	OasdiffSource,
	ReviewItem,
	RunReport,
	RunTrigger,
	ServiceResult,
} from "@schemend/core";
import { z } from "zod";

/**
 * Mirrors @schemend/core's types field-for-field, each tied to its type with
 * `satisfies z.ZodType<T>` — if core's type gains/renames/retypes a field, the matching schema
 * fails to compile here instead of silently drifting and only failing at runtime against a real
 * server response. Used by HttpRepository only; MockRepository's data is already typed, not
 * parsed.
 */
const ApiSourceSchema = z.discriminatedUnion("type", [
	z.object({ type: z.literal("openapi"), location: z.string() }),
	z.object({
		type: z.literal("package"),
		ecosystem: z.enum(["npm", "maven", "nuget"]),
		name: z.string(),
		version: z.string(),
	}),
]) satisfies z.ZodType<ApiSource>;

const ApiEntrySchema = z.object({
	name: z.string(),
	kind: z.enum(["internal", "external"]),
	source: ApiSourceSchema,
	usedIn: z.array(z.string()),
	evidence: z.exactOptional(z.array(z.string())),
}) satisfies z.ZodType<ApiEntry>;

const OasdiffSourceSchema = z.object({
	tool: z.literal("oasdiff"),
	id: z.string(),
	level: z.number(),
}) satisfies z.ZodType<OasdiffSource>;

const ApiChangeSchema = z.object({
	id: z.string(),
	severity: z.enum(["breaking", "non-breaking"]),
	summary: z.string(),
	target: z.string(),
	source: OasdiffSourceSchema,
}) satisfies z.ZodType<ApiChange>;

const ReviewItemSchema = z.object({
	file: z.string(),
	reason: z.string(),
}) satisfies z.ZodType<ReviewItem>;

const CheckResultSchema = z.object({
	name: z.string(),
	status: z.enum(["passed", "failed", "skipped"]),
	detail: z.exactOptional(z.string()),
}) satisfies z.ZodType<CheckResult>;

const ConfidenceSchema = z.enum([
	"verified-by-tests",
	"verified-by-build",
	"unverified",
]) satisfies z.ZodType<Confidence>;

const ChangeRequestSchema = z.object({
	url: z.string(),
	number: z.exactOptional(z.number()),
}) satisfies z.ZodType<ChangeRequest>;

const ServiceResultSchema = z.object({
	service: z.string(),
	language: z.string(),
	branch: z.string(),
	steps: z.array(z.string()),
	changedFiles: z.array(z.string()),
	checks: z.array(CheckResultSchema),
	review: z.array(ReviewItemSchema),
	confidence: ConfidenceSchema,
	costUsd: z.number(),
	changeRequest: z.exactOptional(ChangeRequestSchema),
	diff: z.exactOptional(z.string()),
}) satisfies z.ZodType<ServiceResult>;

const RunTriggerSchema = z.object({
	type: z.enum(["schema-change", "package-release"]),
	detail: z.string(),
}) satisfies z.ZodType<RunTrigger>;

const RunReportSchema = z.object({
	api: z.string(),
	startedAt: z.string(),
	finishedAt: z.string(),
	changes: z.array(ApiChangeSchema),
	services: z.array(ServiceResultSchema),
	budgetUsd: z.number(),
	spentUsd: z.number(),
	stoppedReason: z.exactOptional(z.string()),
	trigger: z.exactOptional(RunTriggerSchema),
}) satisfies z.ZodType<RunReport>;

export const ApiEntryListSchema = z.array(ApiEntrySchema);
export const RunReportListSchema = z.array(RunReportSchema);
