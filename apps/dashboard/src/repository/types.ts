import type { ApiEntry, RunReport } from "@schemend/core";

export interface Repository {
  listRuns(): Promise<RunReport[]>;
  listApis(): Promise<ApiEntry[]>;
}

export type {
  ApiEntry,
  CheckResult,
  RunReport,
  ServiceResult,
} from "@schemend/core";
