import { createWriteStream } from "node:fs";
import type { CheckEvent } from "@schemend/core";

export interface EventRecorder {
  onEvent(event: CheckEvent): void;
  /** Flushes and closes the file; always await this before the process exits. */
  close(): Promise<void>;
}

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
