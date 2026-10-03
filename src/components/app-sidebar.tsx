"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BarChart3,
  ClipboardList,
  Home,
  Receipt,
  ShieldCheck,
} from "lucide-react";
import { cn } from "@/lib/utils";

const links = [
  { href: "/home", label: "Home", icon: Home },
  { href: "/product-sales", label: "Product sales", icon: Receipt },
  { href: "/counts", label: "Counts", icon: ClipboardList },
  { href: "/reports", label: "Reports", icon: BarChart3 },
  { href: "/admin", label: "Admin", icon: ShieldCheck, adminOnly: true },
];

function isActive(href: string, pathname: string) {
  if (href === "/home") {
    // Orders, stock-in and stock-out are reached from Home's cards, so Home
    // stays highlighted while working in them.
    return ["/home", "/import", "/export", "/orders", "/stock-in", "/stock-out"].some(
      (path) => pathname === path || (path !== "/home" && pathname.startsWith(`${path}/`)),
    );
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
