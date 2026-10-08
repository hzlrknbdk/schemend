let token: string | undefined;

/**
 * `schemend ui` puts its one-time access token in the URL fragment (`#token=...`), never the
 * query string, so it never reaches the local server's access logs or a `Referer` header. This
 * reads it into memory once, then strips it from the address bar immediately — the token itself
 * is never written to localStorage, sessionStorage, or a cookie. Call once, on the client only,
 * before the first HttpRepository request (see HttpRepository's constructor).
 */
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
