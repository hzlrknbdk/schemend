import type { ApiEntry, RunReport } from "./types";

export const apis: ApiEntry[] = [
	{
		name: "orders-service",
		kind: "internal",
		source: { type: "openapi", location: "openapi.yaml" },
		usedIn: ["src/lib/orders-client.ts", "src/components/OrderTotal.tsx"],
		evidence: ["env ORDERS_API_URL in src/lib/orders-client.ts"],
	},
	{
		name: "Firebase Cloud Messaging",
		kind: "external",
		source: {
			type: "package",
			ecosystem: "npm",
			name: "firebase-admin",
			version: "11.0.0",
		},
		usedIn: ["src/lib/push.ts"],
	},
	{
		name: "AWS SDK",
		kind: "external",
		source: {
			type: "package",
			ecosystem: "npm",
			name: "aws-sdk",
			version: "2.1492.0",
		},
		usedIn: ["src/lib/s3.ts", "src/lib/sqs.ts"],
	},
	{
		name: "Google Maps",
		kind: "external",
		source: {
			type: "package",
			ecosystem: "npm",
			name: "@googlemaps/js-api-loader",
			version: "1.16.2",
		},
		usedIn: ["src/components/Map.tsx"],
	},
	{
		name: "OpenAI SDK",
		kind: "external",
		source: {
			type: "package",
			ecosystem: "npm",
			name: "openai",
			version: "3.3.0",
		},
		usedIn: ["src/lib/ai.ts"],
	},
	{
		name: "iyzico",
		kind: "external",
		source: {
			type: "package",
			ecosystem: "npm",
			name: "iyzipay",
			version: "2.0.61",
		},
		usedIn: ["src/lib/payments.ts"],
	},
	{
		name: "Trendyol Partner API",
		kind: "external",
		source: {
			type: "package",
			ecosystem: "npm",
			name: "trendyol-partner-sdk",
			version: "1.4.0",
		},
		usedIn: ["src/lib/marketplace.ts"],
	},
];

const ordersServiceDiff = `diff --git a/src/types/order.ts b/src/types/order.ts
index 1a2b3c4..5d6e7f8 100644
--- a/src/types/order.ts
+++ b/src/types/order.ts
@@ -1,7 +1,10 @@
 export interface OrderResponse {
   id: string;
-  totalPrice: number;
+  total: {
+    amount: number;
+    currency: string;
+  };
 }
diff --git a/src/lib/orders.ts b/src/lib/orders.ts
index 2b3c4d5..6e7f8a9 100644
--- a/src/lib/orders.ts
+++ b/src/lib/orders.ts
@@ -1,15 +1,18 @@
 export function formatOrderTotal(order: OrderResponse) {
-  return formatCurrency(order.totalPrice);
+  return formatCurrency(
+    order.total.amount,
+    order.total.currency
+  );
 }

 export function getOrderSummary(order: OrderResponse) {
-  const amount = order.totalPrice;
+  const { amount, currency } = order.total;
   return {
     id: order.id,
-    amount,
+    amount,
+    currency,
   };
 }
diff --git a/src/components/OrderTotal.tsx b/src/components/OrderTotal.tsx
index 3c4d5e6..7f8a9b0 100644
--- a/src/components/OrderTotal.tsx
+++ b/src/components/OrderTotal.tsx
@@ -1,6 +1,9 @@
 export function OrderTotal({ order }: Props) {
-  const display = \`$\${order.totalPrice.toFixed(2)}\`;
+  const display = new Intl.NumberFormat(undefined, {
+    style: 'currency',
+    currency: order.total.currency,
+  }).format(order.total.amount);
   return <span>{display}</span>;
 }
`;

export const runs: RunReport[] = [
	{
		api: "orders-service",
		trigger: {
			type: "schema-change",
			detail:
				"openapi.yaml: OrderResponse.totalPrice -> total{amount,currency} (v2.8.1 -> v2.9.0)",
		},
		startedAt: "2026-10-05T21:46:00.000Z",
		finishedAt: "2026-10-05T21:50:38.000Z",
		budgetUsd: 5,
		spentUsd: 2.26,
		changes: [
			{
				id: "response-property-removed-OrderResponse.totalPrice-0",
				severity: "breaking",
				summary: "OrderResponse.totalPrice removed",
				target: "OrderResponse.totalPrice",
				source: { tool: "oasdiff", id: "response-property-removed", level: 3 },
			},
			{
				id: "response-property-added-OrderResponse.total-0",
				severity: "non-breaking",
				summary: "OrderResponse.total added",
				target: "OrderResponse.total",
				source: { tool: "oasdiff", id: "response-property-added", level: 1 },
			},
			{
				id: "response-property-added-OrderResponse.total.currency-0",
				severity: "non-breaking",
				summary: "OrderResponse.total.currency added",
				target: "OrderResponse.total.currency",
				source: { tool: "oasdiff", id: "response-property-added", level: 1 },
			},
		],
		services: [
			{
				service: "checkout-web",
				language: "TypeScript",
				branch: "schemend/orders-v2.9.0",
				steps: ["detect", "baseline", "regenerate", "impact", "fix", "verify"],
				changedFiles: [
					"src/types/order.ts",
					"src/lib/orders.ts",
					"src/components/OrderTotal.tsx",
				],
				checks: [
					{ name: "build", status: "passed" },
					{ name: "typecheck", status: "passed" },
					{ name: "test", status: "passed", detail: "48/48" },
				],
				review: [],
				confidence: "verified-by-tests",
				costUsd: 0.64,
				changeRequest: {
					url: "https://github.com/hzlrknbdk/schemend-demo/pull/184",
					number: 184,
				},
				diff: ordersServiceDiff,
			},
			{
				service: "invoice-service",
				language: "Java",
				branch: "schemend/orders-v2.9.0",
				steps: ["detect", "baseline", "regenerate", "impact", "fix", "verify"],
				changedFiles: ["src/main/java/com/schemend/orders/OrderClient.java"],
				checks: [
					{ name: "build", status: "passed" },
					{ name: "test", status: "passed", detail: "22/22" },
				],
				review: [],
				confidence: "verified-by-tests",
				costUsd: 0.51,
				changeRequest: {
					url: "https://github.com/hzlrknbdk/schemend-demo/pull/92",
					number: 92,
				},
			},
			{
				service: "notification-service",
				language: "C#",
				branch: "schemend/orders-v2.9.0",
				steps: ["detect", "baseline", "regenerate", "impact", "fix"],
				changedFiles: ["Services/ReceiptTemplate.cs"],
				checks: [
					{ name: "build", status: "passed" },
					{ name: "test", status: "passed", detail: "9/9" },
				],
				review: [
					{
						file: "Services/ReceiptTemplate.cs",
						reason:
							'The receipt template hardcodes the "TL" currency suffix. The new currency field may differ. No test covers this template.',
					},
				],
				confidence: "verified-by-build",
				costUsd: 0.69,
				changeRequest: {
					url: "https://github.com/hzlrknbdk/schemend-demo/pull/58",
					number: 58,
				},
			},
			{
				service: "fulfillment-worker",
				language: "TypeScript",
				branch: "schemend/orders-v2.9.0",
				steps: ["detect", "baseline", "regenerate", "impact", "fix", "verify"],
				changedFiles: ["src/workers/orderWorker.ts"],
				checks: [
					{ name: "build", status: "passed" },
					{ name: "test", status: "passed", detail: "15/15" },
				],
				review: [],
				confidence: "verified-by-tests",
				costUsd: 0.42,
				changeRequest: {
					url: "https://github.com/hzlrknbdk/schemend-demo/pull/47",
					number: 47,
				},
			},
		],
	},
	{
		api: "Firebase Cloud Messaging",
		trigger: {
			type: "package-release",
			detail: "firebase-admin: legacy HTTP API retired in favor of HTTP v1",
		},
		startedAt: "2026-10-05T19:30:00.000Z",
		finishedAt: "2026-10-05T19:37:12.000Z",
		budgetUsd: 5,
		spentUsd: 2.31,
		changes: [],
		services: [
			{
				service: "notification-service",
				language: "C#",
				branch: "schemend/fcm-http-v1",
				steps: ["detect", "baseline", "regenerate", "fix", "verify"],
				changedFiles: ["Services/PushNotificationSender.cs"],
				checks: [
					{ name: "build", status: "passed" },
					{ name: "test", status: "passed", detail: "11/11" },
				],
				review: [],
				confidence: "verified-by-tests",
				costUsd: 2.31,
				changeRequest: {
					url: "https://github.com/hzlrknbdk/schemend-demo/pull/59",
					number: 59,
				},
			},
		],
	},
	{
		api: "AWS SDK",
		trigger: {
			type: "package-release",
			detail: "aws-sdk: modular client migration guide, v2 -> v3",
		},
		startedAt: "2026-10-05T17:05:00.000Z",
		finishedAt: "2026-10-05T17:17:04.000Z",
		budgetUsd: 3,
		spentUsd: 3,
		stoppedReason: "budget exceeded",
		changes: [],
		services: [
			{
				service: "checkout-web",
				language: "TypeScript",
				branch: "schemend/aws-sdk-v3",
				steps: ["detect", "baseline", "regenerate", "fix", "verify"],
				changedFiles: ["src/lib/s3.ts"],
				checks: [
					{ name: "build", status: "passed" },
					{ name: "test", status: "passed", detail: "6/6" },
				],
				review: [],
				confidence: "verified-by-tests",
				costUsd: 1.6,
				changeRequest: {
					url: "https://github.com/hzlrknbdk/schemend-demo/pull/61",
					number: 61,
				},
			},
			{
				service: "fulfillment-worker",
				language: "TypeScript",
				branch: "",
				steps: ["detect", "baseline"],
				changedFiles: [],
				checks: [],
				review: [
					{
						file: "src/lib/sqs.ts",
						reason: "budget exhausted before this service could be fixed",
					},
				],
				confidence: "unverified",
				costUsd: 1.4,
			},
		],
	},
	{
		api: "Google Maps",
		trigger: {
			type: "package-release",
			detail:
				"@googlemaps/js-api-loader: Marker deprecated in favor of AdvancedMarkerElement",
		},
		startedAt: "2026-10-04T14:20:00.000Z",
		finishedAt: "2026-10-04T14:23:51.000Z",
		budgetUsd: 3,
		spentUsd: 1.22,
		changes: [],
		services: [
			{
				service: "checkout-web",
				language: "TypeScript",
				branch: "schemend/google-maps-advanced-marker",
				steps: ["detect", "baseline", "fix", "verify"],
				changedFiles: ["src/components/Map.tsx"],
				checks: [
					{ name: "build", status: "passed" },
					{ name: "test", status: "passed", detail: "4/4" },
				],
				review: [],
				confidence: "verified-by-tests",
				costUsd: 1.22,
				changeRequest: {
					url: "https://github.com/hzlrknbdk/schemend-demo/pull/63",
					number: 63,
				},
			},
		],
	},
	{
		api: "OpenAI SDK",
		trigger: {
			type: "package-release",
			detail:
				"openai: client initialization and response API changed, v3 -> v4",
		},
		startedAt: "2026-09-19T09:14:00.000Z",
		finishedAt: "2026-09-19T09:22:19.000Z",
		budgetUsd: 4,
		spentUsd: 3.47,
		changes: [],
		services: [
			{
				service: "invoice-service",
				language: "Java",
				branch: "schemend/openai-v4",
				steps: ["detect", "baseline", "regenerate", "fix", "verify"],
				changedFiles: ["src/main/java/com/schemend/invoice/SummaryClient.java"],
				checks: [
					{ name: "build", status: "passed" },
					{ name: "test", status: "passed", detail: "7/7" },
				],
				review: [],
				confidence: "verified-by-tests",
				costUsd: 3.47,
				changeRequest: {
					url: "https://github.com/hzlrknbdk/schemend-demo/pull/64",
					number: 64,
				},
			},
		],
	},
	{
		api: "iyzico",
		trigger: { type: "package-release", detail: "iyzipay: v2.0.61 -> v2.0.64" },
		startedAt: "2026-09-17T16:32:00.000Z",
		finishedAt: "2026-09-17T16:34:48.000Z",
		budgetUsd: 2,
		spentUsd: 0.94,
		changes: [],
		services: [
			{
				service: "checkout-web",
				language: "TypeScript",
				branch: "schemend/iyzico-2.0.64",
				steps: ["detect", "baseline", "fix", "verify"],
				changedFiles: ["src/lib/payments.ts"],
				checks: [
					{ name: "build", status: "passed" },
					{ name: "test", status: "passed", detail: "3/3" },
				],
				review: [],
				confidence: "verified-by-tests",
				costUsd: 0.94,
				changeRequest: {
					url: "https://github.com/hzlrknbdk/schemend-demo/pull/51",
					number: 51,
				},
			},
		],
	},
	{
		api: "Trendyol Partner API",
		trigger: {
			type: "package-release",
			detail:
				"trendyol-partner-sdk: v1 catalog endpoints retired, migrate to v2",
		},
		startedAt: "2026-09-15T11:06:00.000Z",
		finishedAt: "2026-09-15T11:12:15.000Z",
		budgetUsd: 3,
		spentUsd: 2.08,
		changes: [],
		services: [
			{
				service: "checkout-web",
				language: "TypeScript",
				branch: "schemend/trendyol-v2",
				steps: ["detect", "baseline", "fix"],
				changedFiles: ["src/lib/marketplace.ts"],
				checks: [{ name: "build", status: "passed" }],
				review: [
					{
						file: "src/lib/marketplace.ts",
						reason:
							"v2 requires a new required header (X-Supplier-Id); no fixture covers the value to send.",
					},
				],
				confidence: "verified-by-build",
				costUsd: 2.08,
				changeRequest: {
					url: "https://github.com/hzlrknbdk/schemend-demo/pull/55",
					number: 55,
				},
			},
		],
	},
];
