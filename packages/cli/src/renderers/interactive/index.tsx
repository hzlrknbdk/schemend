import type { CheckEvent } from "@schemend/core";
import { render } from "ink";
import type { Renderer } from "../types.js";
import { App } from "./app.js";
import { createEventStore } from "./event-store.js";

export interface InteractiveRendererOptions {
  productName: string;
  version: string;
  consumer: string;
  onCancel: () => void;
}

/** The Ink UI (SPEC §9): mounts once, then every onEvent call just dispatches into its store. */
export function createInteractiveRenderer(
  options: InteractiveRendererOptions,
): Renderer {
  const store = createEventStore();
  const instance = render(
    <App
      store={store}
      productName={options.productName}
      version={options.version}
      consumer={options.consumer}
      onCancel={options.onCancel}
    />,
  );

  return {
    onEvent(event: CheckEvent) {
      store.dispatch(event);
    },
    async stop() {
      instance.unmount();
      await instance.waitUntilExit();
    },
  };
}
