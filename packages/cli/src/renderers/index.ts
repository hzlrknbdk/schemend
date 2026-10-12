import { createInteractiveRenderer } from "./interactive/index.js";
import { createJsonRenderer } from "./json.js";
import { createPlainRenderer } from "./plain.js";
import type { RendererKind } from "./select.js";

export type { RendererKind } from "./select.js";
export { selectRenderer } from "./select.js";
export type { Renderer } from "./types.js";

export interface RendererContext {
  productName: string;
  version: string;
  consumer: string;
  onCancel: () => void;
}

export function createRenderer(kind: RendererKind, context: RendererContext) {
  switch (kind) {
    case "json":
      return createJsonRenderer();
    case "plain":
      return createPlainRenderer();
    case "interactive":
      return createInteractiveRenderer(context);
  }
}
