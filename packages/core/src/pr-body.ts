import type {
  ApiChange,
  CheckResult,
  ReviewItem,
  ServiceResult,
} from "./types.js";

const DEFAULT_MAX_BODY_LENGTH = 65_000;
const TRUNCATION_NOTE =
  "\n\n*(truncated - see the full run report for details)*";

function formatChange(change: ApiChange): string {
  return `- **${change.severity}** \`${change.target}\`: ${change.summary}`;
}

function formatCheck(check: CheckResult): string {
  const detail = check.detail ? ` - ${check.detail}` : "";
  return `- ${check.name}: ${check.status}${detail}`;
}

function formatReviewItems(items: ReviewItem[]): string {
  return items.map((item) => `- \`${item.file}\`: ${item.reason}`).join("\n");
}

/** Splits agent-flagged items ("structurally fixed, couldn't verify this part") from orchestrator-generated ones (cancelled/budget-exceeded/baseline-failed) - mixing them in one list would hide which kind of attention each needs. */
function formatReviewSection(review: ReviewItem[]): string {
  if (review.length === 0) return "Nothing flagged.";

  const flagged = review.filter((item) => item.source === "agent-flag");
  const other = review.filter((item) => item.source !== "agent-flag");
  const sections: string[] = [];
  if (flagged.length > 0) {
    sections.push(`### Flagged by the agent\n${formatReviewItems(flagged)}`);
  }
  if (other.length > 0) {
    sections.push(`### Other\n${formatReviewItems(other)}`);
  }
  return sections.join("\n\n");
}

/** One api's result, for a PR body that may cover several (a consumer's commits all land on one shared branch/PR regardless of how many config.apis entries produced them - SPEC §2 step 7, DECISIONS.md 2026-10-05). */
export interface ApiServiceResult {
  api: string;
  service: ServiceResult;
}

function formatStepsSection(
  first: ApiServiceResult,
  rest: ApiServiceResult[],
): string {
  const render = (service: ServiceResult) =>
    service.steps.map((step) => `- ${step}`).join("\n");
  if (rest.length === 0) return `## Steps applied\n${render(first.service)}`;
  const parts = [first, ...rest].map(
    ({ api, service }) => `### ${api}\n${render(service)}`,
  );
  return `## Steps applied\n${parts.join("\n\n")}`;
}

function formatVerificationSection(
  first: ApiServiceResult,
  rest: ApiServiceResult[],
): string {
  const render = (service: ServiceResult) =>
    [
      ...service.checks.map(formatCheck),
      `- confidence: ${service.confidence}`,
    ].join("\n");
  if (rest.length === 0) return `## Verification\n${render(first.service)}`;
  const parts = [first, ...rest].map(
    ({ api, service }) => `### ${api}\n${render(service)}`,
  );
  return `## Verification\n${parts.join("\n\n")}`;
}

function formatNeedsReviewSection(
  first: ApiServiceResult,
  rest: ApiServiceResult[],
): string {
  if (rest.length === 0) {
    return `## Needs your review\n${formatReviewSection(first.service.review)}`;
  }
  const parts = [first, ...rest].map(
    ({ api, service }) => `### ${api}\n${formatReviewSection(service.review)}`,
  );
  return `## Needs your review\n${parts.join("\n\n")}`;
}

function formatCostSection(
  first: ApiServiceResult,
  rest: ApiServiceResult[],
): string {
  if (rest.length === 0) {
    return `## Cost\n$${first.service.costUsd.toFixed(4)}`;
  }
  const all = [first, ...rest];
  const parts = all.map(
    ({ api, service }) => `### ${api}\n$${service.costUsd.toFixed(4)}`,
  );
  const total = all.reduce((sum, { service }) => sum + service.costUsd, 0);
  return `## Cost\n${parts.join("\n\n")}\n\nTotal: $${total.toFixed(4)}`;
}

/**
 * Builds a platform-agnostic PR/MR title and body (SPEC §10: what changed, steps applied,
 * verification, needs your review, cost). A PlatformAdapter's openChangeRequest only ever
 * receives the finished {title, body}, never builds it itself, so GitHub and GitLab render
 * identical text. `services` holds one entry per api that contributed to this one PR; with a
 * single entry every section renders exactly as before multi-api support existed (see
 * DECISIONS.md) - with more than one, steps/verification/review/cost each get a `### <api>`
 * subsection so a second api's result isn't silently missing from the body.
 */
export function buildPrBody(
  api: string,
  changes: ApiChange[],
  services: ApiServiceResult[],
  maxBodyLength: number = DEFAULT_MAX_BODY_LENGTH,
): { title: string; body: string } {
  const [first, ...rest] = services;
  if (!first) {
    throw new Error("buildPrBody needs at least one service result");
  }
  const title = `schemend: update ${first.service.service} for ${api} change`;

  const sections = [
    `## What changed\n${changes.map(formatChange).join("\n")}`,
    formatStepsSection(first, rest),
    formatVerificationSection(first, rest),
    formatNeedsReviewSection(first, rest),
    formatCostSection(first, rest),
  ];

  let body = sections.join("\n\n");
  // GitHub and GitLab have different body/description limits (PlatformAdapter.maxBodyLength);
  // keep a safety margin under whichever one the caller passes and point the reader at the run
  // report instead of silently failing openChangeRequest.
  if (body.length > maxBodyLength) {
    body =
      body.slice(0, maxBodyLength - TRUNCATION_NOTE.length) + TRUNCATION_NOTE;
  }

  return { title, body };
}
