import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { runCommand } from "./exec.js";

export interface Worktree {
	dir: string;
	cleanup: () => Promise<void>;
}

// Pins a consumer fixture to scenario.ref without touching the caller's own
// checkout (branch, uncommitted work) of the source repo. Lives outside the
// repo (os tmpdir) so it never shows up as untracked state inside it.
export async function createWorktree(
	repoRoot: string,
	ref: string,
): Promise<Worktree> {
	const parent = await mkdtemp(path.join(tmpdir(), "schemend-eval-worktree-"));
	const dir = path.join(parent, "wt");
	const add = await runCommand(
		`git worktree add --detach "${dir}" ${ref}`,
		repoRoot,
	);
	if (add.exitCode !== 0) {
		await rm(parent, { recursive: true, force: true });
		throw new Error(
			`git worktree add failed for ref "${ref}":\n${add.stderr || add.stdout}`,
		);
	}
	return {
		dir,
		cleanup: async () => {
			const remove = await runCommand(
				`git worktree remove --force "${dir}"`,
				repoRoot,
			);
			if (remove.exitCode !== 0) {
				throw new Error(
					`git worktree remove failed for "${dir}":\n${remove.stderr || remove.stdout}`,
				);
			}
			// git only removes <dir> itself, not the mkdtemp parent we namespaced it under.
			await rm(parent, { recursive: true, force: true });
		},
	};
}
