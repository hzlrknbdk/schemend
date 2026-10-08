const SAFE_PROTOCOLS = new Set(["http:", "https:"]);

/**
 * Guards a URL that comes from outside the build (a PlatformAdapter's PR url today; the local
 * server's API responses once HttpRepository is live) before it's ever used as an href — rejects
 * `javascript:`, `data:`, and anything else that isn't a plain http(s) link.
 */
export function isSafeUrl(url: string): boolean {
	try {
		return SAFE_PROTOCOLS.has(new URL(url).protocol);
	} catch {
		return false;
	}
}
