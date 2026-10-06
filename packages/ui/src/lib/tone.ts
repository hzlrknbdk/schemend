export type Tone = "success" | "warning" | "danger" | "info" | "neutral";

export const toneDotClasses: Record<Tone, string> = {
	success: "bg-success",
	warning: "bg-warning",
	danger: "bg-danger",
	info: "bg-info",
	neutral: "bg-muted-foreground",
};
