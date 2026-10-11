export type RendererKind = "interactive" | "plain" | "json";

export interface SelectRendererOptions {
  /** --json was passed; always wins over the TTY/CI check. */
  json: boolean;
  isTTY: boolean;
  isCi: boolean;
}

/**
 * The one place that decides which of the three renderers runs: --json always wins; otherwise a
 * non-interactive terminal (no TTY, or a CI environment) gets the plain line-by-line renderer,
 * everything else gets the interactive one.
 */
export function selectRenderer(options: SelectRendererOptions): RendererKind {
  if (options.json) return "json";
  if (!options.isTTY || options.isCi) return "plain";
  return "interactive";
}
