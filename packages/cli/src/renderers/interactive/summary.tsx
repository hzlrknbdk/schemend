import type { RunReport } from "@schemend/core";
import { Box, Text } from "ink";
import { formatUsd } from "./format.js";

export interface SummaryProps {
  report: RunReport;
}

export function Summary({ report }: SummaryProps) {
  const hasBranch = report.services.some((service) => service.branch);
  const changeRequestUrl = report.services.find(
    (service) => service.changeRequest,
  )?.changeRequest?.url;

  return (
    <Box flexDirection="column" borderStyle="round" paddingX={1} marginTop={1}>
      <Text bold underline>
        Summary
      </Text>
      {report.services.length === 0 && (
        <Text dimColor>No API changes detected.</Text>
      )}
      {report.services.map((service, index) => {
        const passedChecks = service.checks.filter(
          (check) => check.status === "passed",
        ).length;
        return (
          <Box
            // biome-ignore lint/suspicious/noArrayIndexKey: report.services is rebuilt wholesale on every run-finished, order never changes
            key={`${service.service}-${index}`}
            flexDirection="column"
            marginTop={index > 0 ? 1 : 0}
          >
            <Text>
              {service.service}: {service.confidence} ({passedChecks}/
              {service.checks.length} checks passed)
            </Text>
            <Text dimColor>
              {service.changedFiles.length} file(s) changed,{" "}
              {formatUsd(service.costUsd)} spent
              {service.branch ? `, branch ${service.branch}` : ""}
            </Text>
            {service.review.length > 0 && (
              <Text color="yellow">
                needs review:{" "}
                {service.review.map((item) => item.reason).join("; ")}
              </Text>
            )}
          </Box>
        );
      })}
      <Text>
        {formatUsd(report.spentUsd)} of {formatUsd(report.budgetUsd)} budget
        used
        {report.stoppedReason ? ` (stopped: ${report.stoppedReason})` : ""}
      </Text>
      {changeRequestUrl !== undefined ? (
        <Text dimColor>Pull/merge request: {changeRequestUrl}</Text>
      ) : (
        hasBranch && (
          <Text dimColor>
            Next: review the "schemend/update" branch (git log / git diff), then
            push and open a PR by hand when you're satisfied.
          </Text>
        )
      )}
    </Box>
  );
}
