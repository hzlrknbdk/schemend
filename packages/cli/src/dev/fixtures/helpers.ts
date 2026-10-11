/** Returns a function that hands out increasing ISO timestamps, `stepMs` apart, starting at `startIso`. */
export function createTimestampSequence(
	startIso: string,
	stepMs = 400,
): () => string {
	let current = Date.parse(startIso);
	return () => {
		const timestamp = new Date(current).toISOString();
		current += stepMs;
		return timestamp;
	};
}
