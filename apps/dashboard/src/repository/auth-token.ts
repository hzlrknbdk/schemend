let token: string | undefined;

/** `schemend ui` puts its one-time token in the URL fragment (`#token=...`), never the query string, so it never reaches access logs. Reads it into memory once, strips the address bar, never persists it. */
export function consumeTokenFromUrl(): void {
  if (typeof window === "undefined") return;
  const { hash } = window.location;
  if (!hash.includes("token=")) return;

  const match = hash.match(/(?:^#|&)token=([^&]+)/);
  if (match?.[1]) {
    token = decodeURIComponent(match[1]);
  }
  window.history.replaceState(
    null,
    "",
    `${window.location.pathname}${window.location.search}`,
  );
}

export function getAuthToken(): string | undefined {
  return token;
}
