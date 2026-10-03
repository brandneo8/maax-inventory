import { WorkflowNav } from "@/components/workflow-nav";

export default function WorkflowLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="space-y-6">
      <WorkflowNav />
      {children}
    </div>
  );
}
