import { cleanup, render } from "ink-testing-library";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FIXTURES } from "../../dev/fixtures/index.js";
import { App } from "./app.js";
import { createEventStore } from "./event-store.js";

// Every render() in this file leaves an Ink instance mounted (subscribed to process.stdout's
// "resize" event, among other things) unless unmounted; without this, later tests' resize
// assertions pick up stray listeners from every earlier test still in this file.
afterEach(() => {
	cleanup();
});

/** useSyncExternalStore's re-render and Ink's own output flush both land a tick after dispatch. */
function flush(): Promise<void> {
	return new Promise((resolve) => setImmediate(resolve));
}

function renderApp(overrides: Partial<Parameters<typeof App>[0]> = {}) {
	const store = createEventStore();
	const onCancel = vi.fn();
	const instance = render(
		<App
			store={store}
			productName="schemend"
			version="1.2.3"
			consumer="checkout-web"
			onCancel={onCancel}
			{...overrides}
		/>,
	);
	return { instance, store, onCancel };
}

describe("App", () => {
	it("shows the product header and the cancel hint before anything has happened", () => {
		const { instance } = renderApp();
		const frame = instance.lastFrame() ?? "";
		expect(frame).toContain("schemend v1.2.3");
		expect(frame).toContain("Press q to cancel");
	});

	it("replays successful-fix to a verified-by-tests summary with no cancel hint", async () => {
		const { instance, store } = renderApp();
		for (const event of FIXTURES["successful-fix"] ?? []) store.dispatch(event);
		await flush();

		const frame = instance.lastFrame() ?? "";
		expect(frame).toContain("verified-by-tests");
		expect(frame).toContain("schemend/update");
		expect(frame).not.toContain("Press q to cancel");
	});

	it("replays baseline-failure to an unverified summary with the failure reason", async () => {
		const { instance, store } = renderApp();
		for (const event of FIXTURES["baseline-failure"] ?? [])
			store.dispatch(event);
		await flush();

		const frame = instance.lastFrame() ?? "";
		expect(frame).toContain("baseline-failed");
		expect(frame).toContain("unverified");
		expect(frame).toContain("baseline build/test failed");
	});

	it("replays budget-overrun showing both apis and the stopped reason", async () => {
		const { instance, store } = renderApp();
		for (const event of FIXTURES["budget-overrun"] ?? []) store.dispatch(event);
		await flush();

		const frame = instance.lastFrame() ?? "";
		expect(frame).toContain("orders");
		expect(frame).toContain("invoices");
		expect(frame).toContain("budget exceeded");
	});

	it("replays self-correcting-agent to a verified-by-tests summary after the retry", async () => {
		const { instance, store } = renderApp();
		for (const event of FIXTURES["self-correcting-agent"] ?? [])
			store.dispatch(event);
		await flush();

		const frame = instance.lastFrame() ?? "";
		expect(frame).toContain("verified-by-tests");
	});

	it("calls onCancel when q is pressed while the run is ongoing", () => {
		const { instance, onCancel } = renderApp();
		instance.stdin.write("q");
		expect(onCancel).toHaveBeenCalledTimes(1);
	});

	it("does not call onCancel for q once the run has finished", async () => {
		const { instance, store, onCancel } = renderApp();
		for (const event of FIXTURES["successful-fix"] ?? []) store.dispatch(event);
		await flush();

		instance.stdin.write("q");
		expect(onCancel).not.toHaveBeenCalled();
	});

	it("stacks the steps/agent panels instead of placing them side by side below 80 columns", () => {
		const wide = renderApp({ columns: 100 }).instance.lastFrame() ?? "";
		const narrow = renderApp({ columns: 60 }).instance.lastFrame() ?? "";

		const maxBoxStartsPerLine = (frame: string) =>
			Math.max(...frame.split("\n").map((line) => line.split("╭").length - 1));

		expect(maxBoxStartsPerLine(wide)).toBeGreaterThanOrEqual(2);
		expect(maxBoxStartsPerLine(narrow)).toBe(1);
	});

	it("re-layouts live when the real terminal is resized mid-run, with no columns override", async () => {
		const originalColumns = process.stdout.columns;
		const maxBoxStartsPerLine = (frame: string) =>
			Math.max(...frame.split("\n").map((line) => line.split("╭").length - 1));

		try {
			process.stdout.columns = 60;
			const { instance } = renderApp();
			await flush();
			expect(maxBoxStartsPerLine(instance.lastFrame() ?? "")).toBe(1);

			process.stdout.columns = 100;
			process.stdout.emit("resize");
			// A plain store.dispatch() settles in one flush() elsewhere in this file; a resize
			// goes through Node's "resize" EventEmitter plus Ink's own internal re-measure, which
			// empirically needs several more event-loop turns before lastFrame() reflects it.
			for (let i = 0; i < 10; i++) await flush();
			expect(
				maxBoxStartsPerLine(instance.lastFrame() ?? ""),
			).toBeGreaterThanOrEqual(2);
		} finally {
			process.stdout.columns = originalColumns;
		}
	});
});
