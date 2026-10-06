export type DiffLineType = "context" | "add" | "remove";

export interface DiffLine {
	type: DiffLineType;
	text: string;
}

export interface DiffFile {
	path: string;
	lines: DiffLine[];
}

/** Splits a unified diff (as produced by `git diff`) into per-file +/- lines for display. */
export function parseUnifiedDiff(diff: string): DiffFile[] {
	const files: DiffFile[] = [];
	let current: DiffFile | undefined;

	for (const line of diff.split("\n")) {
		const fileHeader = line.match(/^diff --git a\/(\S+) b\/\S+/);
		if (fileHeader?.[1] !== undefined) {
			current = { path: fileHeader[1], lines: [] };
			files.push(current);
			continue;
		}
		if (!current) continue;
		if (
			line.startsWith("index ") ||
			line.startsWith("--- ") ||
			line.startsWith("+++ ") ||
			line.startsWith("@@")
		) {
			continue;
		}
		if (line.startsWith("+")) current.lines.push({ type: "add", text: line });
		else if (line.startsWith("-"))
			current.lines.push({ type: "remove", text: line });
		else current.lines.push({ type: "context", text: line });
	}

	return files;
}
