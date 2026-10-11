import { createWriteStream } from "node:fs";
import type { CheckEvent } from "@schemend/core";

export interface EventRecorder {
	onEvent(event: CheckEvent): void;
	/** Flushes and closes the file; always await this before the process exits. */
	close(): Promise<void>;
}

/**
 * --record-events <file>: tees every event to an NDJSON file, independent of whichever renderer
 * draws the terminal output. Meant for capturing a real run's events to replay later as a fixture.
 */
export function createEventRecorder(filePath: string): EventRecorder {
	const stream = createWriteStream(filePath, { flags: "w" });
	return {
		onEvent(event: CheckEvent) {
			stream.write(`${JSON.stringify(event)}\n`);
		},
		close() {
			return new Promise((resolve) => {
				stream.end(() => resolve());
			});
		},
	};
}
