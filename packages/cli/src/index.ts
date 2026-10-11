#!/usr/bin/env node
import path from "node:path";
import {
	ConfigValidationError,
	DockerUnavailableError,
	diffSchemas,
	loadConfig,
	runCheck,
	VERSION,
} from "@schemend/core";
import { typescriptAdapter } from "@schemend/lang-typescript";
import { Command } from "commander";
import { realExec } from "./exec.js";
import { createEventRecorder } from "./record-events.js";
import { createRenderer, selectRenderer } from "./renderers/index.js";

const program = new Command()
	.name("schemend")
	.description(
		"Update code affected by API changes and open pull requests for review.",
	)
	.version(VERSION);

program
	.command("init")
	.description("Check your setup, discover APIs and create schemend.config.ts")
	.action(() => console.log("init: not implemented yet"));

program
	.command("diff <oldSchema> <newSchema>")
	.description(
		"Diff two OpenAPI schema files with oasdiff and print the changes (dev command)",
	)
	.action(async (oldSchema: string, newSchema: string) => {
		try {
			const changes = await diffSchemas(
				path.resolve(oldSchema),
				path.resolve(newSchema),
				realExec,
			);
			if (changes.length === 0) {
				console.log("No changes found.");
				return;
			}
			console.table(
				changes.map((change) => ({
					severity: change.severity,
					target: change.target,
					summary: change.summary,
				})),
			);
		} catch (error) {
			if (error instanceof DockerUnavailableError) {
				console.error(error.message);
				process.exitCode = 1;
				return;
			}
			throw error;
		}
	});

program
	.command("check")
	.description(
		"Dry run: detect API changes, fix affected code, commit to a local branch (SPEC §9)",
	)
	.option(
		"-c, --config <path>",
		"path to schemend.config.ts",
		"schemend.config.ts",
	)
	.option(
		"--json",
		"emit one JSON-encoded event per line (NDJSON) instead of human-readable output",
	)
	.option(
		"--record-events <file>",
		"also record every event as NDJSON to this file",
	)
	.action(
		async (opts: { config: string; json?: boolean; recordEvents?: string }) => {
			const root = process.cwd();
			const configPath = path.resolve(root, opts.config);

			const abortController = new AbortController();
			const onSigint = () => abortController.abort();
			process.on("SIGINT", onSigint);

			const kind = selectRenderer({
				json: Boolean(opts.json),
				isTTY: Boolean(process.stdout.isTTY),
				isCi: Boolean(process.env.CI),
			});
			const renderer = createRenderer(kind, {
				productName: "schemend",
				version: VERSION,
				consumer: path.basename(root),
				onCancel: () => abortController.abort(),
			});
			const recorder = opts.recordEvents
				? createEventRecorder(path.resolve(root, opts.recordEvents))
				: undefined;

			try {
				const config = await loadConfig(configPath);
				await runCheck({
					config,
					root,
					exec: realExec,
					adapters: [typescriptAdapter],
					abortController,
					onEvent: (event) => {
						renderer.onEvent(event);
						recorder?.onEvent(event);
					},
				});
			} catch (error) {
				if (error instanceof DockerUnavailableError) {
					console.error(error.message);
					process.exitCode = 1;
					return;
				}
				if (error instanceof ConfigValidationError) {
					console.error(error.message);
					process.exitCode = 1;
					return;
				}
				throw error;
			} finally {
				process.off("SIGINT", onSigint);
				await renderer.stop?.();
				await recorder?.close();
			}
		},
	);

await program.parseAsync();
