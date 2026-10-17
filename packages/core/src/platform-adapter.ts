import type { Exec } from "./context.js";
import type { ChangeRequest } from "./types.js";

/** One hosting platform's branch/PR operations; core never calls the GitHub/GitLab API or git directly. */
export interface PlatformAdapter {
  id: string;
  /** GitHub's practical PR body limit is ~65,536 characters; GitLab's issuable description limit is ~1,048,576 bytes - buildPrBody truncates to this, not a shared constant, since the two aren't the same. */
  maxBodyLength: number;
  detectCi(env: NodeJS.ProcessEnv): boolean;
  /** `exec` is host-level (never Docker) and already scoped so its commands run against `root`, same convention as git.ts. */
  pushBranch(root: string, branch: string, exec: Exec): Promise<void>;
  openChangeRequest(params: {
    branch: string;
    baseBranch: string;
    title: string;
    body: string;
  }): Promise<ChangeRequest>;
  /** Takes the openChangeRequest result, not a URL, so the adapter can use its own `number` (PR/MR id) directly instead of re-parsing one out of a URL string. */
  comment(changeRequest: ChangeRequest, body: string): Promise<void>;
}
