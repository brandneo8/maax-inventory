"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BarChart3,
  ClipboardList,
  FileText,
  Home,
  Package,
  ShieldCheck,
  ShoppingBag,
} from "lucide-react";
import { cn } from "@/lib/utils";

const links = [
  { href: "/home", label: "Home", icon: Home },
  { href: "/products", label: "Products", icon: Package },
  { href: "/orders", label: "Orders", icon: ShoppingBag },
  { href: "/invoices", label: "Invoices", icon: FileText },
  { href: "/counts", label: "Counts", icon: ClipboardList },
  { href: "/reports", label: "Reports", icon: BarChart3 },
  { href: "/admin", label: "Admin", icon: ShieldCheck, adminOnly: true },
];

function isActive(href: string, pathname: string) {
  if (href === "/home") {
    return pathname === "/home" || pathname === "/import" || pathname === "/export";
  }
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function AppSidebar({ isAdmin, collapsed = false }: { isAdmin: boolean; collapsed?: boolean }) {
  const pathname = usePathname();

  return (
    <nav
      id="app-sidebar-nav"
      className={cn("flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto px-3 pb-3", collapsed && "items-center px-2")}
    >
      {links
        .filter((link) => !link.adminOnly || isAdmin)
        .map((link) => {
          const Icon = link.icon;
          const active = isActive(link.href, pathname);
          return (
            <Link
              key={link.href}
              href={link.href}
              title={link.label}
              aria-label={link.label}
              className={cn(
                "flex items-center gap-2 rounded-lg px-3 py-2 text-sm",
                collapsed && "justify-center px-2",
                active ? "bg-slate-900 font-medium text-white" : "text-slate-700 hover:bg-slate-100",
              )}
            >
              <Icon className="size-4 shrink-0" aria-hidden />
              {collapsed ? null : link.label}
            </Link>
          );
        })}
    </nav>
  );
}
