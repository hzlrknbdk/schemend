import type { CheckEvent } from "@schemend/core";
import { createInitialState, reduceEvents, type UiState } from "./store.js";

export interface EventStore {
  getState(): UiState;
  dispatch(event: CheckEvent): void;
  subscribe(listener: () => void): () => void;
}

export function createEventStore(): EventStore {
  let state = createInitialState();
  const listeners = new Set<() => void>();

  return {
    getState: () => state,
    dispatch(event: CheckEvent) {
      state = reduceEvents(state, event);
      for (const listener of listeners) listener();
    },
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
