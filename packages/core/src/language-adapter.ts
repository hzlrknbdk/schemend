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
