import { Button } from "@schemend/ui";
import { Link } from "@tanstack/react-router";
import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import { NotFoundState } from "@/components/dashboard/not-found-state";

export function RunNotFoundState() {
  return (
    <DashboardShell>
      <NotFoundState
        title="Run not found"
        description="This run doesn't exist, or the link to it is out of date."
        action={
          <Button asChild variant="outline" size="sm">
            <Link to="/runs">Back to runs</Link>
          </Button>
        }
      />
    </DashboardShell>
  );
}
