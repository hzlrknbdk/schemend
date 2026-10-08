#!/usr/bin/env node
/**
 * Runs after `vite build` (never during dev — see docs/conventions.md §17). Walks every
 * prerendered HTML file, hashes the inline <script> bodies actually present in THAT file (each
 * TanStack Start route embeds a different hydration payload, so the hash set differs per file —
 * see DECISIONS.md), and writes a Content-Security-Policy <meta> tag built from exactly those
 * hashes.
 *
 * style-src keeps 'unsafe-inline': Radix's RovingFocusGroup (under Tabs) renders a static
 * `style="outline:none"` attribute server-side, and its Popper-based components (Select) set
 * position/transform via the `style` attribute at runtime after hydration — the latter can't be
 * known at build time at all, so a hash-only style-src isn't achievable with this component
 * library (see DECISIONS.md). script-src has no such exception: fails the build (non-zero exit)
 * on a <script> this script can't hash, or an on*= inline event-handler attribute.
 */
import { createHash } from "node:crypto";
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

function parseArgs(argv) {
	const args = {};
	for (let i = 0; i < argv.length; i += 2) {
		const key = argv[i]?.replace(/^--/, "");
		if (!key) continue;
		args[key] = argv[i + 1];
	}
	return args;
}

const { dist, "connect-src": connectSrc } = parseArgs(process.argv.slice(2));
if (!dist || !connectSrc) {
	console.error("Usage: inject-csp.mjs --dist <dir> --connect-src <value>");
	process.exitCode = 1;
	process.exit();
}

function findHtmlFiles(dir) {
	return readdirSync(dir, { recursive: true, withFileTypes: true })
		.filter((entry) => entry.isFile() && entry.name.endsWith(".html"))
		.map((entry) => join(entry.parentPath, entry.name));
}

function sha256Base64(text) {
	return createHash("sha256").update(text, "utf8").digest("base64");
}

function assertNoUnhashablePatterns(html, file) {
	if (/<style\b/i.test(html)) {
		throw new Error(
			`${file}: inline <style> element found — not covered by the Radix style="" exception.`,
		);
	}
	if (/\son[a-z]+\s*=\s*"/i.test(html)) {
		throw new Error(
			`${file}: inline on*= event handler attribute found — script-src-attr has no 'unsafe-inline'.`,
		);
	}
}

function collectScriptHashes(html, file) {
	const hashes = new Set();
	const scriptTag = /<script\b([^>]*)>([\s\S]*?)<\/script>/gi;
	for (const match of html.matchAll(scriptTag)) {
		const [, attrs, body] = match;
		const hasSrc = /\bsrc\s*=/i.test(attrs);
		const trimmedBody = body.trim();
		if (hasSrc) {
			if (trimmedBody.length > 0) {
				throw new Error(
					`${file}: <script> has both src and inline content — can't hash it.`,
				);
			}
			continue;
		}
		if (trimmedBody.length === 0) continue;
		hashes.add(`'sha256-${sha256Base64(body)}'`);
	}
	return hashes;
}

function buildCsp(scriptHashes) {
	const scriptSrc = ["'self'", ...scriptHashes].join(" ");
	return [
		"default-src 'self'",
		`script-src ${scriptSrc}`,
		"style-src 'self' 'unsafe-inline'",
		"font-src 'self'",
		"img-src 'self'",
		`connect-src ${connectSrc}`,
		"object-src 'none'",
		"base-uri 'self'",
		"form-action 'self'",
	].join("; ");
}

function injectMeta(html, csp) {
	const withoutOldCsp = html.replace(
		/\s*<meta[^>]*http-equiv=["']Content-Security-Policy["'][^>]*>/i,
		"",
	);
	const metaTag = `<meta http-equiv="Content-Security-Policy" content="${csp}">`;
	const charsetMatch = withoutOldCsp.match(/<meta[^>]*charset=[^>]*>/i);
	if (charsetMatch) {
		return withoutOldCsp.replace(
			charsetMatch[0],
			`${charsetMatch[0]}${metaTag}`,
		);
	}
	return withoutOldCsp.replace(/<head[^>]*>/i, (tag) => `${tag}${metaTag}`);
}

let processed = 0;
for (const file of findHtmlFiles(dist)) {
	const html = readFileSync(file, "utf8");
	assertNoUnhashablePatterns(html, file);
	const scriptHashes = collectScriptHashes(html, file);
	const csp = buildCsp(scriptHashes);
	writeFileSync(file, injectMeta(html, csp), "utf8");
	processed += 1;
}

if (processed === 0) {
	console.error(`inject-csp: no .html files found under ${dist}`);
	process.exitCode = 1;
	process.exit();
}

console.log(
	`inject-csp: wrote CSP meta into ${processed} file(s) under ${dist}`,
);
