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

/**
 * Builds a platform-agnostic PR/MR title and body (SPEC §10: what changed, steps applied,
 * verification, needs your review, cost). A PlatformAdapter's openChangeRequest only ever
 * receives the finished {title, body}, never builds it itself, so GitHub and GitLab render
 * identical text.
 */
export function buildPrBody(
  api: string,
  changes: ApiChange[],
  service: ServiceResult,
  maxBodyLength: number = DEFAULT_MAX_BODY_LENGTH,
): { title: string; body: string } {
  const title = `schemend: update ${service.service} for ${api} change`;

  const sections = [
    `## What changed\n${changes.map(formatChange).join("\n")}`,
    `## Steps applied\n${service.steps.map((step) => `- ${step}`).join("\n")}`,
    `## Verification\n${[...service.checks.map(formatCheck), `- confidence: ${service.confidence}`].join("\n")}`,
    `## Needs your review\n${formatReviewSection(service.review)}`,
    `## Cost\n$${service.costUsd.toFixed(4)}`,
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
