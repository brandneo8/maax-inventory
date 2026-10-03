"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

// The three pages Home's cards open, named the same way, so users can hop
// between them without going back to Home (mirrors the Admin tab bar).
const tabs = [
  { href: "/orders", label: "Plan what to order" },
  { href: "/stock-in", label: "Receive orders" },
  { href: "/stock-out", label: "Product usage" },
];

export function WorkflowNav() {
  const pathname = usePathname();

  return (
    <div className="space-y-3">
      <Link className="text-sm text-muted underline" href="/home">
        ← Back to Home
      </Link>
      <nav className="flex flex-wrap gap-1 rounded-xl border border-border bg-card p-1">
        {tabs.map((tab) => {
          const active = pathname === tab.href || pathname.startsWith(`${tab.href}/`);
          return (
            <Link
              key={tab.href}
              href={tab.href}
              aria-current={active ? "page" : undefined}
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
