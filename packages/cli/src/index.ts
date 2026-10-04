#!/usr/bin/env node
import path from "node:path";
import { DockerUnavailableError, diffSchemas, VERSION } from "@schemend/core";
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

await program.parseAsync();
