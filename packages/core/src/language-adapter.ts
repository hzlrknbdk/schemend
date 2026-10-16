import type { AdapterContext } from "./context.js";
import type {
  AffectedLocation,
  ApiChange,
  ApiEntry,
  CheckResult,
} from "./types.js";

/** One language's discovery, impact analysis, build and test logic; core never imports ts-morph, Maven or dotnet directly. */
export interface LanguageAdapter {
  id: string;
  detect(root: string): Promise<boolean>;
  discoverApis(ctx: AdapterContext): Promise<ApiEntry[]>;
  regenerateClient?(ctx: AdapterContext, api: ApiEntry): Promise<void>;
  /** Extra, language-specific standalone-package check beyond lockfile+workspaceMarkers (SPEC §4) - e.g. Maven's reactor relationship needs parsing a <parent> block. Runs in addition to, not instead of, the generic check. */
  assertSupportedLayout?(root: string): Promise<void>;
  /** Throws if anything outside `root` this adapter needs to read (e.g. a sibling schema file) resolves outside `repoRoot`, isn't a real file, or is a URL - a build file isn't trusted blindly for a networked install container. */
  assertDockerVisibility?(root: string, repoRoot: string): Promise<void>;
  findAffected(
    ctx: AdapterContext,
    api: ApiEntry,
    changes: ApiChange[],
  ): Promise<AffectedLocation[]>;
  build(ctx: AdapterContext): Promise<CheckResult>;
  test(ctx: AdapterContext): Promise<CheckResult>;
  /** Best-effort error count + first error from a failed build, for the fix agent's progress log (SPEC §14) only - never a source of truth. Per-adapter since each toolchain's error format differs; returns {} rather than a fabricated count. */
  summarizeBuildFailure?(result: CheckResult): {
    errorCount?: number;
    firstError?: string;
  };
  /** Same idea as summarizeBuildFailure, for a failed test run's own CheckResult.detail. */
  summarizeTestResult?(result: CheckResult): {
    passed?: number;
    failed?: number;
    firstFailure?: string;
  };
  dockerImage: string;
  dockerfile?: string;
  /** A fixed command for most adapters; a resolver when the target depends on the consumer's layout (e.g. C#'s solution-or-project discovery). Must restore the same target build/test/findAffected use later. */
  installCommand: string | ((root: string) => Promise<string>);
  /** A fixed filename for most adapters; a resolver when none reliably sits at `root` (e.g. C#'s arbitrarily-named, possibly-nested project file). Used by assertStandaloneProject and the dependency volume's content hash. */
  lockfile: string | ((root: string) => Promise<string>);
  workspaceMarkers: readonly string[];
  dependencyVolumePath: string;
}
