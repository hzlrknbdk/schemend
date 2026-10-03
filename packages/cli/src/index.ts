#!/usr/bin/env node
import { VERSION } from "@schemend/core";
import { Command } from "commander";

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

await program.parseAsync();
