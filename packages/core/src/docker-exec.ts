import { createHash, randomUUID } from "node:crypto";
import { access, readFile } from "node:fs/promises";
import path from "node:path";
import type { Exec, ExecResult } from "./context.js";

function quote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

function rootHash(root: string): string {
  return createHash("sha256").update(root).digest("hex").slice(0, 12);
}

/** Prefix shared by every dependency volume ever created for `root`, regardless of lockfile state. */
function volumePrefix(root: string): string {
  return `schemend-deps-${rootHash(root)}-`;
}

/**
 * Bump whenever a volume created under the previous version would be wrong to reuse as-is (e.g.
 * this one: pre-`--user` volumes have root-owned content a plain top-level chown can't fix).
 * Folded into dependencyVolumeName's output, so pruneStaleDependencyVolumes removes old-scheme
 * volumes the same way it removes old-lockfile ones - no separate migration path needed.
 */
const DEPENDENCY_VOLUME_SCHEME_VERSION = "v2";

async function pathExists(target: string): Promise<boolean> {
  try {
    await access(target);
    return true;
  } catch {
    return false;
  }
}

/** Thrown by assertStandaloneProject when the consumer isn't a standalone package (SPEC §4). */
export class UnsupportedWorkspaceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UnsupportedWorkspaceError";
  }
}

/**
 * Throws UnsupportedWorkspaceError if `lockfile` is missing at `root`, or if any of
 * `workspaceMarkers` exists in an ancestor directory of `root` - both signal `root` is a member
 * of a larger workspace, not the standalone package v1's Docker mount assumes (SPEC §4).
 */
export async function assertStandaloneProject(
  root: string,
  lockfile: string,
  workspaceMarkers: readonly string[],
): Promise<void> {
  const reason = (detail: string) =>
    new UnsupportedWorkspaceError(
      `${detail} - schemend v1 only supports a standalone package as the consumer (SPEC §4); see PLAN.md v1.1 for workspace support.`,
    );

  if (!(await pathExists(path.join(root, lockfile)))) {
    throw reason(`no ${lockfile} found at ${root}`);
  }

  let dir = path.dirname(root);
  for (;;) {
    for (const marker of workspaceMarkers) {
      if (await pathExists(path.join(dir, marker))) {
        throw reason(
          `found ${marker} at ${dir}, above the consumer root ${root}`,
        );
      }
    }
    const parent = path.dirname(dir);
    if (parent === dir) return;
    dir = parent;
  }
}

/**
 * Deterministic name for `root`'s dependency volume, keyed by both the project and its lockfile's
 * content - a lockfile change (dependency added/bumped) produces a different name, so the run
 * naturally lands on a fresh, correctly-populated volume instead of reusing stale node_modules; the
 * old volume is left behind for pruneStaleDependencyVolumes to remove. Assumes the lockfile exists
 * (assertStandaloneProject is the boundary check for that).
 */
export async function dependencyVolumeName(
  root: string,
  lockfilePath: string,
): Promise<string> {
  const lockfileContent = await readFile(lockfilePath, "utf-8");
  const lockHash = createHash("sha256")
    .update(lockfileContent)
    .digest("hex")
    .slice(0, 12);
  return `${volumePrefix(root)}${lockHash}-${DEPENDENCY_VOLUME_SCHEME_VERSION}`;
}

/**
 * Re-anchors a `LanguageAdapter.dependencyVolumePath` (e.g. "/workspace/node_modules", written
 * assuming /workspace *is* the consumer root) under `containerConsumerPath` instead, for a
 * container where /workspace is mounted as the whole repo and the consumer only lives at a
 * subpath of it (see ensureDockerCtx, check.ts). A path that isn't under "/workspace" at all
 * (e.g. Java's "/opt/maven-repo", a location deliberately unrelated to the project tree) is
 * returned unchanged - it was never meant to move when the mount's meaning changes.
 */
export function rebaseDependencyVolumePath(
  dependencyVolumePath: string,
  containerConsumerPath: string,
): string {
  const prefix = "/workspace/";
  if (!dependencyVolumePath.startsWith(prefix)) return dependencyVolumePath;
  return `${containerConsumerPath}/${dependencyVolumePath.slice(prefix.length)}`;
}

export function resolveContainerPath(
  rawPath: string,
  repoRoot: string | undefined,
): string {
  const prefix = "/workspace/";
  if (repoRoot === undefined || !rawPath.startsWith(prefix)) return rawPath;
  return path.join(repoRoot, rawPath.slice(prefix.length));
}

/**
 * Removes every dependency volume for `root` except `currentVolume` (e.g. ones left behind by an
 * older lockfile - see dependencyVolumeName). Best-effort: a listing or removal failure (including
 * a volume still in use by another running `schemend check`) is silently skipped, never thrown -
 * this is hygiene, not correctness.
 */
export async function pruneStaleDependencyVolumes(
  exec: Exec,
  root: string,
  currentVolume: string,
): Promise<void> {
  const prefix = volumePrefix(root);
  const list = await exec(
    `docker volume ls --format '{{.Name}}' --filter ${quote(`name=${prefix}`)}`,
  );
  if (list.exitCode !== 0) return;

  const stale = list.stdout
    .split("\n")
    .map((line) => line.trim())
    .filter((name) => name.length > 0 && name !== currentVolume);

  for (const name of stale) {
    await exec(`docker volume rm ${quote(name)}`);
  }
}

/**
 * Ensures `image` exists locally, building it from `dockerfile` (its containing directory as the
 * build context) if missing - otherwise relies on `docker run`'s own implicit pull, same as
 * oasdiff's pre-existing third-party image.
 */
export async function ensureDockerImage(
  exec: Exec,
  image: string,
  dockerfile?: string,
): Promise<void> {
  const inspect = await exec(`docker image inspect ${quote(image)}`);
  if (inspect.exitCode === 0) return;
  if (!dockerfile) return;

  const context = path.dirname(dockerfile);
  const build = await exec(
    `docker build -t ${quote(image)} -f ${quote(dockerfile)} ${quote(context)}`,
  );
  if (build.exitCode !== 0) {
    throw new Error(
      `failed to build Docker image ${image}: ${build.stderr || build.stdout}`,
    );
  }
}

/** The host uid/gid a container should run as, instead of the image's default (root). */
export interface ContainerUser {
  uid: number;
  gid: number;
}

/** An additional bind mount beyond `root` itself - e.g. the consumer's own directory, writable, layered inside a read-only `root` (see DECISIONS.md's broad-mount/network rule). */
export interface ExtraMount {
  source: string;
  target: string;
  readOnly?: boolean;
}

export interface DockerExecOptions {
  /** "bridge" (default) for steps that need the registry, "none" to block network entirely. */
  network: "bridge" | "none";
  /** Extra named-volume mounts, e.g. { [volumeName]: "/workspace/node_modules" }. */
  volumes?: Record<string, string>;
  /** When aborted while a command is in flight, the running container is force-killed. */
  abortController?: AbortController;
  /** Runs the container as this uid/gid instead of root - see chownDependencyVolume. */
  user?: ContainerUser;
  /** Mounts `root` read-only instead of read-write. Pair with an `extraMounts` entry that re-mounts the actually-writable subdirectory read-write on top (a more specific bind mount always wins over its parent, regardless of the parent's own read-only flag). */
  readOnlyRoot?: boolean;
  /** Extra bind mounts beyond `root`/`volumes`, each independent of `root`'s own read-only flag. */
  extraMounts?: ExtraMount[];
  /** Overrides the default `-w /workspace` working directory. */
  cwd?: string;
}

/**
 * Wraps any shell command to run inside `image`, with `root` mounted at /workspace (SPEC §4:
 * "Docker-vs-local decision stays in one place in core") - read-write by default, read-only with
 * `readOnlyRoot` (see DECISIONS.md: checks/install mount the whole repo read-only so a sibling
 * schema file resolves, with only the consumer's own directory, via `extraMounts`, writable).
 * Each call gets its own container name so a pending abort can `docker kill` exactly that
 * container - the underlying host exec has no signal support of its own, so this is the only
 * hook available without threading a signal through the whole Exec type (deferred, see
 * DECISIONS.md).
 */
export function createDockerExec(
  hostExec: Exec,
  root: string,
  image: string,
  options: DockerExecOptions,
): Exec {
  const volumeArgs = Object.entries(options.volumes ?? {})
    .map(([volume, target]) => `-v ${quote(`${volume}:${target}`)}`)
    .join(" ");
  const extraMountArgs = (options.extraMounts ?? [])
    .map(
      (mount) =>
        `-v ${quote(`${mount.source}:${mount.target}${mount.readOnly ? ":ro" : ""}`)}`,
    )
    .join(" ");
  const cwd = options.cwd ?? "/workspace";

  return async (command: string): Promise<ExecResult> => {
    const name = `schemend-${randomUUID()}`;
    const dockerCommand = [
      "docker run --rm",
      `--name ${name}`,
      `--network ${options.network}`,
      options.user
        ? `--user ${options.user.uid}:${options.user.gid} -e HOME=/tmp`
        : "",
      `-v ${quote(`${root}:/workspace${options.readOnlyRoot ? ":ro" : ""}`)}`,
      extraMountArgs,
      volumeArgs,
      `-w ${cwd}`,
      image,
      `sh -c ${quote(command)}`,
    ]
      .filter(Boolean)
      .join(" ");

    const abortController = options.abortController;
    const onAbort = (): void => {
      void hostExec(`docker kill ${name}`);
    };
    abortController?.signal.addEventListener("abort", onAbort, {
      once: true,
    });
    try {
      return await hostExec(dockerCommand);
    } finally {
      abortController?.signal.removeEventListener("abort", onAbort);
    }
  };
}

/**
 * Docker creates a fresh named volume owned by root:root; a non-root `user` writing into it
 * (install, then every build/test call) would get EACCES on the mount point itself without this.
 * Runs as root (no `user` option) specifically to be able to chown to someone else. Only the
 * mount point needs fixing, not every file under it, because DEPENDENCY_VOLUME_SCHEME_VERSION
 * guarantees `volume` is always freshly created under this scheme - never pre-populated by an
 * older, root-owned install.
 */
export async function chownDependencyVolume(
  exec: Exec,
  image: string,
  volume: string,
  volumeTarget: string,
  user: ContainerUser,
): Promise<void> {
  const command = `docker run --rm --network none -v ${quote(`${volume}:${volumeTarget}`)} ${image} chown ${user.uid}:${user.gid} ${volumeTarget}`;
  const result = await exec(command);
  if (result.exitCode !== 0) {
    throw new Error(
      `failed to chown dependency volume ${volume}: ${result.stderr || result.stdout}`,
    );
  }
}

export interface ContainerDepsOptions {
  exec: Exec;
  root: string;
  image: string;
  volume: string;
  volumeTarget: string;
  installCommand: string;
  abortController?: AbortController;
  user?: ContainerUser;
  readOnlyRoot?: boolean;
  extraMounts?: ExtraMount[];
  cwd?: string;
}

/**
 * Installs `root`'s dependencies inside `image`, into the given named volume, with network access
 * (SPEC §6: only install needs the network; the build/test exec this feeds is `--network none`).
 * `readOnlyRoot`/`extraMounts`/`cwd` mirror DockerExecOptions - see ensureDockerCtx (check.ts),
 * which mounts the whole repo here too, for the same reason as the final build/test exec.
 */
export async function ensureContainerDeps(
  options: ContainerDepsOptions,
): Promise<void> {
  const install = createDockerExec(options.exec, options.root, options.image, {
    network: "bridge",
    volumes: { [options.volume]: options.volumeTarget },
    ...(options.abortController !== undefined
      ? { abortController: options.abortController }
      : {}),
    ...(options.user !== undefined ? { user: options.user } : {}),
    ...(options.readOnlyRoot !== undefined
      ? { readOnlyRoot: options.readOnlyRoot }
      : {}),
    ...(options.extraMounts !== undefined
      ? { extraMounts: options.extraMounts }
      : {}),
    ...(options.cwd !== undefined ? { cwd: options.cwd } : {}),
  });
  const result = await install(options.installCommand);
  if (result.exitCode !== 0) {
    throw new Error(
      `failed to install dependencies in Docker (${options.installCommand}): ${result.stderr || result.stdout}\n` +
        `If this looks like a network/registry problem rather than a real project error, the ` +
        `dependency volume (${options.volume}) may have been left in a bad state by an earlier ` +
        `interrupted run - delete it and retry: docker volume rm ${options.volume}`,
    );
  }
}
