import type { CheckEvent } from "@schemend/core";

export interface Renderer {
  onEvent(event: CheckEvent): void;
  stop?(): void | Promise<void>;
}
