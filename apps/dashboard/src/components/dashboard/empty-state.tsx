import type { ReactNode } from "react";
import { PageHeader } from "@/components/dashboard/page-header";

interface EmptyStateProps {
  title: string;
  description: string;
  action?: ReactNode | undefined;
}

export function EmptyState({ title, description, action }: EmptyStateProps) {
  return <PageHeader title={title} description={description} action={action} />;
}
