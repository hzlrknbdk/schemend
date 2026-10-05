export const files = [
	"src/lib/orders.ts",
	"src/components/OrderTotal.tsx",
	"src/types/order.ts",
];

export type DiffLineType = "context" | "remove" | "add";

export type DiffLine = {
	type: DiffLineType;
	text: string;
};

export const diffs: Record<string, DiffLine[]> = {
	"src/lib/orders.ts": [
		{
			type: "context",
			text: " export function formatOrderTotal(order: OrderResponse) {",
		},
		{ type: "remove", text: "-  return formatCurrency(order.totalPrice);" },
		{ type: "add", text: "+  return formatCurrency(" },
		{ type: "add", text: "+    order.total.amount," },
		{ type: "add", text: "+    order.total.currency" },
		{ type: "add", text: "+  );" },
		{ type: "context", text: " }" },
		{ type: "context", text: "" },
		{
			type: "context",
			text: " export function getOrderSummary(order: OrderResponse) {",
		},
		{ type: "remove", text: "-  const amount = order.totalPrice;" },
		{ type: "add", text: "+  const { amount, currency } = order.total;" },
		{ type: "context", text: "   return {" },
		{ type: "context", text: "     id: order.id," },
		{ type: "remove", text: "-    amount," },
		{ type: "add", text: "+    amount," },
		{ type: "add", text: "+    currency," },
		{ type: "context", text: "   };" },
		{ type: "context", text: " }" },
	],
	"src/components/OrderTotal.tsx": [
		{
			type: "context",
			text: " export function OrderTotal({ order }: Props) {",
		},
		{
			type: "remove",
			text: "-  const display = `$${order.totalPrice.toFixed(2)}`;",
		},
		{
			type: "add",
			text: "+  const display = new Intl.NumberFormat(undefined, {",
		},
		{ type: "add", text: "+    style: 'currency'," },
		{ type: "add", text: "+    currency: order.total.currency," },
		{ type: "add", text: "+  }).format(order.total.amount);" },
		{ type: "context", text: "   return <span>{display}</span>;" },
		{ type: "context", text: " }" },
	],
	"src/types/order.ts": [
		{ type: "context", text: " export interface OrderResponse {" },
		{ type: "context", text: "   id: string;" },
		{ type: "remove", text: "-  totalPrice: number;" },
		{ type: "add", text: "+  total: {" },
		{ type: "add", text: "+    amount: number;" },
		{ type: "add", text: "+    currency: string;" },
		{ type: "add", text: "+  };" },
		{ type: "context", text: " }" },
	],
};
