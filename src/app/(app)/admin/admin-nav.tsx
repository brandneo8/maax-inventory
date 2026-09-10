"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const tabs = [
  { href: "/admin/users", label: "Users" },
  { href: "/admin/products", label: "Products" },
  { href: "/admin/suppliers", label: "Suppliers" },
];

export function AdminNav() {
  const pathname = usePathname();
  const isIndex = pathname === "/admin";

  return (
    <div className="space-y-3">
      {isIndex ? null : (
        <Link className="text-sm text-muted underline" href="/admin">
          Back to Admin
        </Link>
      )}
      <nav className="flex flex-wrap gap-1 rounded-xl border border-border bg-card p-1">
        {tabs.map((tab) => {
          const active = pathname === tab.href || pathname.startsWith(`${tab.href}/`);
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={cn(
                "rounded-lg px-3 py-1.5 text-sm",
                active ? "bg-slate-900 font-medium text-white" : "text-slate-700 hover:bg-slate-100",
              )}
            >
              {tab.label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
