import { AdminNav } from "./admin-nav";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="space-y-6">
      <AdminNav />
      {children}
    </div>
  );
}
