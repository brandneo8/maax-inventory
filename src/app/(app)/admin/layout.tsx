import { requireAdmin } from "@/lib/auth";
import { AdminNav } from "./admin-nav";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await requireAdmin();

  return (
    <div className="space-y-6">
      <AdminNav />
      {children}
    </div>
  );
}
