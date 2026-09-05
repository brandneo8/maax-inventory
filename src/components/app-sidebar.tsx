"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  ArrowDownToLine,
  ArrowUpFromLine,
  BarChart3,
  Package,
  ShieldCheck,
  ShoppingBag,
} from "lucide-react";
import { cn } from "@/lib/utils";

const links = [
  { href: "/import", label: "Import", icon: ArrowDownToLine },
  { href: "/export", label: "Export", icon: ArrowUpFromLine },
  { href: "/products", label: "Products", icon: Package },
  { href: "/orders", label: "Orders", icon: ShoppingBag },
  { href: "/admin", label: "Admin", icon: ShieldCheck, adminOnly: true },
  { href: "/reports", label: "Reports", icon: BarChart3 },
];

function isActive(href: string, pathname: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function AppSidebar({ isAdmin }: { isAdmin: boolean }) {
  const pathname = usePathname();

  return (
    <nav className="flex flex-1 flex-col gap-1 px-3 py-3">
      {links
        .filter((link) => !link.adminOnly || isAdmin)
        .map((link) => {
          const Icon = link.icon;
          const active = isActive(link.href, pathname);
          return (
            <Link
              key={link.href}
              href={link.href}
              className={cn(
                "flex items-center gap-2 rounded-lg px-3 py-2 text-sm",
                active ? "bg-slate-900 font-medium text-white" : "text-slate-700 hover:bg-slate-100",
              )}
            >
              <Icon className="size-4 shrink-0" aria-hidden />
              {link.label}
            </Link>
          );
        })}
    </nav>
  );
}
