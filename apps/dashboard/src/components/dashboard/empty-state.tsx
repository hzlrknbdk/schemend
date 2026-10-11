import type { ReactNode } from "react";
import { PageHeader } from "@/components/dashboard/page-header";

interface EmptyStateProps {
  title: string;
  description: string;
  /** What to do next — a CopyCommand, a Link, or omitted when there's nothing actionable. */
  action?: ReactNode | undefined;
}

export function EmptyState({ title, description, action }: EmptyStateProps) {
  return <PageHeader title={title} description={description} action={action} />;
}
