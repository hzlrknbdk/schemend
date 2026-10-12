export type ApiSource =
  | { type: "openapi"; location: string }
  | {
      type: "package";
      ecosystem: "npm" | "maven" | "nuget";
      name: string;
      version: string;
    };

export interface ApiEntry {
  name: string;
  kind: "internal" | "external";
  source: ApiSource;
  usedIn: string[];
  evidence?: string[];
}

export interface OasdiffSource {
  tool: "oasdiff";
  id: string;
  level: number;
}

export interface ApiChange {
  id: string;
  severity: "breaking" | "non-breaking";
  summary: string;
  target: string;
  source: OasdiffSource;
}

export interface AffectedLocation {
  file: string;
  line: number;
  changeId: string;
  snippet: string;
}

export interface ReviewItem {
  file: string;
  reason: string;
}

export interface CheckResult {
  name: string;
  status: "passed" | "failed" | "skipped";
  detail?: string;
}

export type Confidence =
  | "verified-by-tests"
  | "verified-by-build"
  | "unverified";

export interface ChangeRequest {
  url: string;
  /** Not every platform's openChangeRequest result exposes a number (e.g. a bare URL). */
  number?: number;
}

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
  changeRequest?: ChangeRequest;
  diff?: string;
}

export interface RunTrigger {
  type: "schema-change" | "package-release";
  detail: string;
}

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
