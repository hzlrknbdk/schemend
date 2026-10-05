#!/usr/bin/env node
import path from "node:path";
import { intro, log, outro } from "@clack/prompts";
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
	.action(async (opts: { config: string }) => {
		intro("schemend check");
		const root = process.cwd();
		const configPath = path.resolve(root, opts.config);

		try {
			const config = await loadConfig(configPath);
			const report = await runCheck({
				config,
				root,
				exec: realExec,
				adapters: [typescriptAdapter],
				onStep: (message) => log.step(message),
			});

			if (report.changes.length === 0) {
				log.info("No API changes detected.");
			}
			for (const service of report.services) {
				const headline =
					`${service.service}: ${service.confidence}` +
					(service.branch ? ` -> ${service.branch}` : "");
				if (service.review.length > 0) {
					log.warn(
						`${headline} (needs review: ${service.review
							.map((item) => item.reason)
							.join("; ")})`,
					);
				} else {
					log.success(headline);
				}
			}

			const budgetLine = `$${report.spentUsd.toFixed(2)} of $${report.budgetUsd.toFixed(2)} budget used`;
			outro(
				report.stoppedReason
					? `${budgetLine} (stopped: ${report.stoppedReason})`
					: budgetLine,
			);
		} catch (error) {
			if (error instanceof DockerUnavailableError) {
				log.error(error.message);
				process.exitCode = 1;
				return;
			}
			if (error instanceof ConfigValidationError) {
				log.error(error.message);
				process.exitCode = 1;
				return;
			}
			throw error;
		}
	});

await program.parseAsync();
