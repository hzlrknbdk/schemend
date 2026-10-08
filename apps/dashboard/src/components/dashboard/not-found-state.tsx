import type { ReactNode } from "react";
import { PageHeader } from "@/components/dashboard/page-header";

interface NotFoundStateProps {
	title: string;
	description: string;
	action?: ReactNode | undefined;
}

export function NotFoundState({
	title,
	description,
	action,
}: NotFoundStateProps) {
	return <PageHeader title={title} description={description} action={action} />;
}
