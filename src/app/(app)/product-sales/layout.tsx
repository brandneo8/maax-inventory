import { requireAdmin } from "@/lib/auth";

// Admin-only area: stylists are sent Home.
export default async function AdminOnlyLayout({ children }: { children: React.ReactNode }) {
  await requireAdmin();
  return children;
}
