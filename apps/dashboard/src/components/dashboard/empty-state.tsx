import { PageHeader } from "@/components/dashboard/page-header";

interface EmptyStateProps {
	title: string;
	description: string;
}

export function EmptyState({ title, description }: EmptyStateProps) {
	return <PageHeader title={title} description={description} />;
}
