/** One hosting platform's branch/PR operations; core never calls the GitHub/GitLab API or git directly. */
export interface PlatformAdapter {
	id: string;
	detectCi(env: NodeJS.ProcessEnv): boolean;
	pushBranch(root: string, branch: string): Promise<void>;
	openChangeRequest(params: {
		branch: string;
		baseBranch: string;
		title: string;
		body: string;
	}): Promise<string>;
	comment(url: string, body: string): Promise<void>;
}
