import type { CheckEvent } from "@schemend/core";
import type { Renderer } from "./types.js";

/** --json: one JSON-encoded CheckEvent per line (NDJSON), unmodified. */
export function createJsonRenderer(): Renderer {
  return {
    onEvent(event: CheckEvent) {
      console.log(JSON.stringify(event));
    },
  };
}
