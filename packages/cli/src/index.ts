#!/usr/bin/env node
import path from "node:path";
import type { Config, PlatformAdapter } from "@schemend/core";
import {
  ChangeRequestFailedAfterPushError,
  ConfigValidationError,
  DockerUnavailableError,
  diffSchemas,
  GitLsRemoteError,
  isIncomplete,
  loadConfig,
  MissingApiKeyError,
  NotAGitRepositoryError,
  pushSkipReason,
  runCheck,
  runRun,
  VERSION,
} from "@schemend/core";
import { csharpAdapter } from "@schemend/lang-csharp";
import { javaAdapter } from "@schemend/lang-java";
import { typescriptAdapter } from "@schemend/lang-typescript";
import {
  GitPushError as GithubGitPushError,
  MissingChangeRequestNumberError as GithubMissingChangeRequestNumberError,
  githubAdapter,
  MissingGithubRepositoryError,
  MissingGithubTokenError,
} from "@schemend/platform-github";
import {
  GitPushError as GitlabGitPushError,
  MissingChangeRequestNumberError as GitlabMissingChangeRequestNumberError,
  gitlabAdapter,
  MissingGitlabProjectError,
  MissingGitlabProjectUrlError,
  MissingGitlabTokenError,
} from "@schemend/platform-gitlab";
import { Command } from "commander";
import { realExec } from "./exec.js";
import { createEventRecorder } from "./record-events.js";
import { createRenderer, selectRenderer } from "./renderers/index.js";

const platformAdapters: Record<Config["platform"], PlatformAdapter> = {
  github: githubAdapter,
  gitlab: gitlabAdapter,
};

/** Known, user-facing failures from the push/PR step - printed as a clean message, never a stack trace (schemend run's only output in CI is its own log). Anything else is a real bug and should surface with its stack trace. */
function printIfKnownRunError(error: unknown): boolean {
  const known = [
    DockerUnavailableError,
    ConfigValidationError,
    MissingApiKeyError,
    NotAGitRepositoryError,
    GitLsRemoteError,
    ChangeRequestFailedAfterPushError,
    MissingGithubTokenError,
    MissingGithubRepositoryError,
    GithubGitPushError,
    GithubMissingChangeRequestNumberError,
    MissingGitlabTokenError,
    MissingGitlabProjectError,
    MissingGitlabProjectUrlError,
    GitlabGitPushError,
    GitlabMissingChangeRequestNumberError,
  ];
  if (
    error instanceof Error &&
    known.some((errorClass) => error instanceof errorClass)
  ) {
    console.error(error.message);
    process.exitCode = 1;
    return true;
  }
  return false;
}

function containerUser(): { uid: number; gid: number } | undefined {
  const uid = process.getuid?.();
  const gid = process.getgid?.();
  return uid !== undefined && gid !== undefined ? { uid, gid } : undefined;
}

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
        const user = containerUser();
        const report = await runCheck({
          config,
          root,
          exec: realExec,
          adapters: [typescriptAdapter, javaAdapter, csharpAdapter],
          abortController,
          ...(user !== undefined ? { containerUser: user } : {}),
          onEvent: (event) => {
            renderer.onEvent(event);
            recorder?.onEvent(event);
          },
        });
        // An incomplete run (cancelled/budget-exceeded, or a service whose baseline/schema-read/
        // Docker setup failed) must not exit 0 - that would hide the failure from CI.
        if (isIncomplete(report)) {
          process.exitCode = 1;
        }
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
        if (error instanceof MissingApiKeyError) {
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

program
  .command("run")
  .description(
    "CI entry: schemend check, then push the branch and open/update one PR per consumer (SPEC §9)",
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
        const user = containerUser();
        const report = await runRun({
          config,
          root,
          exec: realExec,
          adapters: [typescriptAdapter, javaAdapter, csharpAdapter],
          platform: platformAdapters[config.platform],
          abortController,
          ...(user !== undefined ? { containerUser: user } : {}),
          onEvent: (event) => {
            renderer.onEvent(event);
            recorder?.onEvent(event);
          },
        });
        const skipReason = pushSkipReason(report);
        if (skipReason === "no-changes") {
          console.log("Push skipped: no changes to push.");
        } else if (skipReason === "incomplete-run") {
          const detail = report.stoppedReason ?? "one or more services failed";
          console.error(`Push skipped: run did not complete (${detail}).`);
          process.exitCode = 1;
        }
      } catch (error) {
        if (printIfKnownRunError(error)) return;
        throw error;
      } finally {
        process.off("SIGINT", onSigint);
        await renderer.stop?.();
        await recorder?.close();
      }
    },
  );

await program.parseAsync();
