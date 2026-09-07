"use client";

import { useEffect, useState } from "react";
import { LogOut, PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { signOut } from "@/app/login/actions";
import { AppSidebar } from "@/components/app-sidebar";
import { BrandLogo } from "@/components/brand-logo";
import { BranchSwitcher } from "@/components/branch-switcher";
import type { BranchOption } from "@/lib/auth";
import { btnSecondaryClass } from "@/lib/ui";
import { cn } from "@/lib/utils";

const SIDEBAR_KEY = "pulse-sidebar-collapsed";

export function AppShell({
  email,
  isAdmin,
  allowedBranches,
  branch,
  children,
}: {
  email: string;
  isAdmin: boolean;
  allowedBranches: BranchOption[];
  branch: BranchOption | null;
  children: React.ReactNode;
}) {
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    setCollapsed(window.localStorage.getItem(SIDEBAR_KEY) === "1");
  }, []);

  function toggleCollapsed() {
    setCollapsed((current) => {
      const next = !current;
      window.localStorage.setItem(SIDEBAR_KEY, next ? "1" : "0");
      return next;
    });
  }

  return (
    <div className="app-shell">
      <aside className="app-sidebar" data-collapsed={collapsed ? "true" : "false"}>
        <div className={cn("flex flex-col gap-3 px-3 pt-4 pb-3", collapsed && "items-center px-2")}>
          <BrandLogo collapsed={collapsed} />
          <button
            className={btnSecondaryClass}
            type="button"
            onClick={toggleCollapsed}
            aria-expanded={!collapsed}
            aria-controls="app-sidebar-nav"
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            {collapsed ? <PanelLeftOpen className="size-4" /> : <PanelLeftClose className="size-4" />}
            {collapsed ? null : <span className="ml-2">Collapse</span>}
          </button>
          <BranchSwitcher branches={allowedBranches} selected={branch} collapsed={collapsed} />
        </div>
        <AppSidebar isAdmin={isAdmin} collapsed={collapsed} />
        <form action={signOut} className={cn("mt-auto space-y-2 border-t border-border p-3", collapsed && "p-2")}>
          {collapsed ? null : <p className="truncate text-xs text-muted">{email}</p>}
          <button
            className={cn(btnSecondaryClass, "w-full", collapsed && "px-2")}
            type="submit"
            aria-label="Sign out"
            title="Sign out"
          >
            <LogOut className="size-4" />
            {collapsed ? null : <span className="ml-2">Sign out</span>}
          </button>
        </form>
      </aside>
      <main className="app-main">{children}</main>
    </div>
  );
}
