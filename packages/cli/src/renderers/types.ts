import type { CheckEvent } from "@schemend/core";

/** Consumes the CheckEvent stream from one `schemend check` run and turns it into output. */
export interface Renderer {
	onEvent(event: CheckEvent): void;
	/** Flushes/unmounts once the run (or the whole command) ends. A no-op for stateless renderers. */
	stop?(): void | Promise<void>;
}
