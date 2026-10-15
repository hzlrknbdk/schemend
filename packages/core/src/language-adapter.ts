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
  /**
   * Extra, language-specific "is this really a standalone package" check beyond the generic
   * lockfile+workspaceMarkers one (SPEC §4) - e.g. Maven's multi-module reactor relationship
   * can't be expressed as a simple ancestor-filename marker, since it needs parsing a <parent>
   * block and comparing it against the file it points to. Throws (e.g. UnsupportedWorkspaceError)
   * when the project isn't supported; called in addition to, not instead of, the generic check.
   */
  assertSupportedLayout?(root: string): Promise<void>;
  /**
   * Validates that anything outside `root` this adapter's install/build/test needs to read (e.g.
   * Java's generate-sources re-running on every compile, needing a sibling schema file - see
   * DECISIONS.md) resolves safely within `repoRoot`, the boundary ensureDockerCtx actually
   * mounts. A pom.xml/build file is repo content, not something to trust blindly when deciding
   * what a networked container can reach - implementations must throw if the resolved path
   * escapes `repoRoot`, isn't a real file, or isn't a local path at all (e.g. a URL).
   */
  assertDockerVisibility?(root: string, repoRoot: string): Promise<void>;
  findAffected(
    ctx: AdapterContext,
    api: ApiEntry,
    changes: ApiChange[],
  ): Promise<AffectedLocation[]>;
  build(ctx: AdapterContext): Promise<CheckResult>;
  test(ctx: AdapterContext): Promise<CheckResult>;
  /**
   * Best-effort error count + first error message out of a failed build's own CheckResult.detail,
   * for the fix agent's progress log (SPEC §14) only - never a source of truth (findAffected's own
   * parsing is that). Each toolchain's error format is different (tsc's `error TS1234`, javac's
   * `[ERROR] file:[line,col]`, MSBuild's `error CS1234`), so this lives per-adapter rather than as
   * one regex in core guessing at all of them; returns {} when nothing recognizable is found,
   * never a fabricated count.
   */
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
  /**
   * A fixed command for most adapters; a resolver when the right target depends on the
   * consumer's own layout (e.g. C#'s solution-or-project discovery, see packages/lang-csharp) -
   * it must restore the exact same target build/test/findAffected will later use, or a later
   * `--no-restore` call fails against an unrestored project.
   */
  installCommand: string | ((root: string) => Promise<string>);
  /**
   * A fixed filename for most adapters (checked directly at `root`); a resolver when no single
   * well-known filename reliably sits there (e.g. C#, whose project file has an arbitrary name
   * and may live below `root`) - must return a root-relative path. Used both by
   * assertStandaloneProject (SPEC §4) and to key the dependency volume's content hash.
   */
  lockfile: string | ((root: string) => Promise<string>);
  workspaceMarkers: readonly string[];
  dependencyVolumePath: string;
}
