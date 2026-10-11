import { createJsonRenderer } from "./json.js";
import { createPlainRenderer } from "./plain.js";
import type { RendererKind } from "./select.js";

export { selectRenderer } from "./select.js";
export type { RendererKind } from "./select.js";
export type { Renderer } from "./types.js";

/**
 * Maps a RendererKind to its implementation. "interactive" falls back to the plain renderer for
 * now - the Ink UI is the next slice of this task (docs/PLAN.md).
 */
export function createRenderer(kind: RendererKind) {
	switch (kind) {
		case "json":
			return createJsonRenderer();
		case "plain":
		case "interactive":
			return createPlainRenderer();
	}
}
