import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import type { Exec } from "./context.js";

/** Thrown when `git show <ref>:<path>` fails (e.g. the file didn't exist yet at that ref). */
export class GitRefNotFoundError extends Error {
	constructor(ref: string, relPath: string, detail: string) {
		super(`could not read "${relPath}" at ref "${ref}": ${detail}`);
		this.name = "GitRefNotFoundError";
	}
}

/**
 * Writes `relPath` (relative to the current directory) as it existed at `ref` into a throwaway
 * temp file and returns its path. Used to get the "old" side of a schema diff (SPEC §2 step 2)
 * when the "new" side is simply the file's current content on disk; the caller removes the temp
 * dir when done. `:./` makes the path relative to the current directory rather than the repo
 * root, so this works the same whether the consumer is the whole repo or a subdirectory of it.
 */
export async function writeFileAtRef(
	ref: string,
	relPath: string,
	exec: Exec,
): Promise<string> {
	const result = await exec(`git show ${ref}:./${relPath}`);
	if (result.exitCode !== 0) {
		throw new GitRefNotFoundError(ref, relPath, result.stderr || result.stdout);
	}

	const tempDir = await mkdtemp(path.join(tmpdir(), "schemend-git-ref-"));
	const tempFile = path.join(tempDir, path.basename(relPath));
	await writeFile(tempFile, result.stdout);
	return tempFile;
}
