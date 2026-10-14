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
  dockerImage: string;
  dockerfile?: string;
  installCommand: string;
  lockfile: string;
  workspaceMarkers: readonly string[];
  dependencyVolumePath: string;
}
