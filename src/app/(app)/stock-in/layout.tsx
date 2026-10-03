import { WorkflowNav } from "@/components/workflow-nav";
import { requireAdmin } from "@/lib/auth";

// Admin-only area: stylists are sent Home.
export default async function WorkflowLayout({ children }: { children: React.ReactNode }) {
  await requireAdmin();
  return (
    <div className="space-y-6">
      <WorkflowNav />
      {children}
    </div>
  );
}
