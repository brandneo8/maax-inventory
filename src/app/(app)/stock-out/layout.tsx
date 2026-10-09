import { WorkflowNav } from "@/components/workflow-nav";

// Ordering, receiving and product usage: open to every signed-in staff member
// (the (app) layout signs people in). No request data is read here, so moving
// between these areas shows the page's loading skeleton straight away.
export default function WorkflowLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="space-y-6">
      <WorkflowNav />
      {children}
    </div>
  );
}
