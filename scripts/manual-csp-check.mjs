#!/usr/bin/env node
/**
 * Manual verification script, not part of any build/test pipeline. Used to check that the CSP
 * `scripts/inject-csp.mjs` writes doesn't break anything in a real browser, and that
 * style-src's 'unsafe-inline' is actually covering every inline style Radix sets (see
 * DECISIONS.md). Listens for the real `securitypolicyviolation` DOM event — more reliable than
 * grepping console text — while clicking through the Radix-heavy interactions on each route.
 *
 * Playwright is NOT a project dependency (see docs/PLAN.md's v1.1 note — this script is meant
 * to become a real e2e test once a Playwright test harness is added; until then it needs its
 * own throwaway install, since adding it to any package.json wasn't part of this task):
 *
 *   mkdir -p /tmp/schemend-csp-check && cd /tmp/schemend-csp-check
 *   npm init -y && npm install playwright && npx playwright install chromium
 *
 * Then, from the repo root, with both apps built and previewed on these two ports:
 *
 *   pnpm --filter @schemend/landing build && pnpm --filter @schemend/landing exec vite preview --port 4301 --strictPort &
 *   pnpm --filter @schemend/dashboard build && pnpm --filter @schemend/dashboard exec vite preview --port 4302 --strictPort &
 *   NODE_PATH=/tmp/schemend-csp-check/node_modules node scripts/manual-csp-check.mjs
 */
import { chromium } from "playwright";

const targets = [
	{ app: "landing", base: "http://localhost:4301", routes: ["/"] },
	{
		app: "dashboard",
		base: "http://localhost:4302",
		routes: ["/", "/apis", "/impact", "/migration", "/runs", "/settings"],
	},
];

const browser = await chromium.launch();
let anyViolation = false;

for (const { app, base, routes } of targets) {
	for (const route of routes) {
		const page = await browser.newPage();
		const violations = [];
		await page.exposeFunction("__reportCspViolation", (detail) => {
			violations.push(detail);
		});
		await page.addInitScript(() => {
			window.addEventListener("securitypolicyviolation", (e) => {
				window.__reportCspViolation(
					`${e.violatedDirective}: blocked ${e.blockedURI || "(inline)"} on ${location.pathname}`,
				);
			});
		});
		page.on("pageerror", (err) => violations.push(`pageerror: ${err.message}`));

		await page.goto(`${base}${route}`, { waitUntil: "networkidle" });

		const clickAllCount = async (selector) => {
			const count = await page
				.locator(selector)
				.count()
				.catch(() => 0);
			if (count > 0) {
				await page
					.locator(selector)
					.first()
					.click({ timeout: 1000 })
					.catch(() => {});
				await page.waitForTimeout(150);
			}
			return count;
		};

		const interactions = {};
		if (app === "landing" && route === "/") {
			// Tabs (multi-language section), mobile nav Sheet, theme toggle.
			interactions.tab = await clickAllCount('[role="tab"]');
			interactions.menuButton = await clickAllCount('[aria-label="Open menu"]');
			interactions.themeToggle = await clickAllCount(
				'button[aria-label*="theme" i]',
			);
		}
		if (app === "dashboard") {
			interactions.themeToggle = await clickAllCount(
				'button[aria-label*="theme" i]',
			);
			if (route === "/settings") {
				// Switch, and Select (Radix Popper — sets `style` at runtime, the case that
				// matters most for the style-src 'unsafe-inline' check).
				interactions.switchEl = await clickAllCount('[role="switch"]');
				interactions.combobox = await clickAllCount('[role="combobox"]');
				await page.waitForTimeout(150);
				interactions.option = await clickAllCount('[role="option"]');
			}
		}

		await page.waitForTimeout(250);
		await page.close();

		console.log(`${app} ${route} interactions:`, interactions);
		if (violations.length > 0) {
			anyViolation = true;
			console.log(`[VIOLATION] ${app} ${route}`);
			for (const v of violations) console.log(`  ${v}`);
		} else {
			console.log(`[ok] ${app} ${route}`);
		}
	}
}

await browser.close();
if (anyViolation) process.exitCode = 1;
