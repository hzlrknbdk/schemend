import type { ApiChange, CheckEvent } from "@schemend/core";
import type { Renderer } from "./types.js";

function breakingCount(changes: ApiChange[]): number {
  return changes.filter((change) => change.severity === "breaking").length;
}

function formatToolCall(
  event: Extract<CheckEvent, { type: "agent-tool-call" }>,
): string {
  switch (event.tool) {
    case "read_file":
    case "edit_file":
      return `${event.api}: agent -> ${event.tool} ${event.file}`;
    case "run_build":
    case "run_tests":
      return `${event.api}: agent -> ${event.tool}`;
  }
}

function formatToolResult(
  event: Extract<CheckEvent, { type: "agent-tool-result" }>,
): string {
  switch (event.tool) {
    case "read_file":
    case "edit_file":
      return `${event.api}: agent <- ${event.tool} ${event.file} (${event.status})`;
    case "run_build": {
      const detail =
        event.errorCount !== undefined
          ? `, ${event.errorCount} error(s)${event.firstError ? `: ${event.firstError}` : ""}`
          : "";
      return `${event.api}: agent <- run_build (${event.status})${detail}`;
    }
    case "run_tests": {
      const counts =
        event.passed !== undefined || event.failed !== undefined
          ? `, ${event.passed ?? 0} passed / ${event.failed ?? 0} failed`
          : "";
      const detail = event.firstFailure ? `: ${event.firstFailure}` : "";
      return `${event.api}: agent <- run_tests (${event.status})${counts}${detail}`;
    }
  }
}

/**
 * Non-interactive output (no TTY, or CI): one line per event, meant to read well in a CI log.
 * Exhaustive switch over CheckEvent's `type`, so a new variant fails typecheck here until handled
 * (docs/conventions.md §15's rule, applied here too even though that doc scopes to the web apps).
 */
export function createPlainRenderer(): Renderer {
  return {
    onEvent(event: CheckEvent) {
      switch (event.type) {
        case "run-started":
          console.log(
            `schemend check: ${event.apis.join(", ")} (budget $${event.budgetUsd.toFixed(2)})`,
          );
          return;
        case "run-finished":
          if (event.report.changes.length === 0) {
            console.log("No API changes detected.");
          }
          console.log(
            `$${event.report.spentUsd.toFixed(2)} of $${event.report.budgetUsd.toFixed(2)} budget used` +
              (event.report.stoppedReason
                ? ` (stopped: ${event.report.stoppedReason})`
                : ""),
          );
          return;
        case "step-started":
          console.log(`${event.api}: ${event.step}...`);
          return;
        case "step-finished":
          console.log(
            `${event.api}: ${event.step} ${event.status} [${event.durationMs}ms]` +
              (event.reason ? ` (${event.reason})` : ""),
          );
          return;
        case "changes-detected":
          console.log(
            `${event.api}: ${event.changes.length} change(s) found (${breakingCount(event.changes)} breaking)`,
          );
          return;
        case "affected-found":
          console.log(
            `${event.api}: ${event.affected.length} location(s) affected`,
          );
          return;
        case "agent-tool-call":
          console.log(formatToolCall(event));
          return;
        case "agent-tool-result":
          console.log(formatToolResult(event));
          return;
        case "file-edited":
          console.log(
            `${event.api}: edited ${event.file} (+${event.added}/-${event.removed})`,
          );
          return;
        case "check-result":
          console.log(
            `${event.api}: ${event.check.name} ${event.check.status}`,
          );
          if (event.check.status === "failed" && event.check.detail) {
            console.log(event.check.detail);
          }
          return;
        case "cost-updated":
          console.log(
            `${event.api}: $${event.spentUsd.toFixed(2)} of $${event.limitUsd.toFixed(2)} spent`,
          );
          return;
        case "service-completed": {
          const { service } = event;
          const headline =
            `${service.service}: ${service.confidence}` +
            (service.branch ? ` -> ${service.branch}` : "");
          console.log(
            service.review.length > 0
              ? `${headline} (needs review: ${service.review.map((item) => item.reason).join("; ")})`
              : headline,
          );
          return;
        }
        default:
          return event satisfies never;
      }
    },
  };
}
