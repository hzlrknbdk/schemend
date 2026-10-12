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
  findAffected(
    ctx: AdapterContext,
    api: ApiEntry,
    changes: ApiChange[],
  ): Promise<AffectedLocation[]>;
  build(ctx: AdapterContext): Promise<CheckResult>;
  test(ctx: AdapterContext): Promise<CheckResult>;
  /** Pinned image build/test run inside (SPEC §4/§6: Docker-vs-local decision stays in core). */
  dockerImage: string;
  /** Builds dockerImage from this Dockerfile if it isn't present locally yet. */
  dockerfile?: string;
  /** Installs dependencies inside the container; run once per `schemend check`, network-enabled. */
  installCommand: string;
  /** Lockfile path relative to the consumer root; its content keys the dependency volume's name. */
  lockfile: string;
  /** Filenames that, found in an ancestor directory, mean the consumer is a workspace member (unsupported in v1, SPEC §4). */
  workspaceMarkers: readonly string[];
  /** Where the dependency volume mounts inside the container, e.g. "/workspace/node_modules". */
  dependencyVolumePath: string;
}
