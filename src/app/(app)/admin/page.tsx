import Link from "next/link";
import { requireAdmin } from "@/lib/auth";

const sections = [
  {
    href: "/admin/users",
    title: "Users",
    body: "Unlock editing and assign Min and Kin access.",
  },
  {
    href: "/admin/products",
    title: "Products",
    body: "Edit the company catalog, salon lists, tags, and suppliers on each SKU.",
  },
  {
    href: "/admin/suppliers",
    title: "Suppliers",
    body: "Maintain supplier contacts, channels, and GST registration.",
  },
];

export default async function AdminPage() {
  await requireAdmin();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Admin</h1>
        <p className="mt-1 text-sm text-muted">
          Manage users, the company product catalog, and suppliers.
        </p>
      </div>
      <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
        {sections.map((section) => (
          <Link
            key={section.href}
            href={section.href}
            className="rounded-xl border border-border bg-card p-4 hover:bg-slate-50"
          >
            <h2 className="text-lg font-semibold">{section.title}</h2>
            <p className="mt-1 text-sm text-muted">{section.body}</p>
          </Link>
        ))}
      </div>
    </div>
  );
}
