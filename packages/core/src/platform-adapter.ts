import type { Exec } from "./context.js";
import type { ChangeRequest } from "./types.js";

/** One hosting platform's branch/PR operations; core never calls the GitHub/GitLab API or git directly. */
export interface PlatformAdapter {
  id: string;
  detectCi(env: NodeJS.ProcessEnv): boolean;
  /** `exec` is host-level (never Docker) and already scoped so its commands run against `root`, same convention as git.ts. */
  pushBranch(root: string, branch: string, exec: Exec): Promise<void>;
  openChangeRequest(params: {
    branch: string;
    baseBranch: string;
    title: string;
    body: string;
  }): Promise<ChangeRequest>;
  comment(url: string, body: string): Promise<void>;
}
