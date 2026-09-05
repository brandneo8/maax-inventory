import { signOut } from "@/app/login/actions";
import { AppSidebar } from "@/components/app-sidebar";
import { BranchSwitcher } from "@/components/branch-switcher";
import type { BranchOption } from "@/lib/auth";
import { btnSecondaryClass } from "@/lib/ui";
import { ChevronDown } from "lucide-react";

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
  return (
    <div className="flex min-h-dvh">
      <aside className="sticky top-0 flex h-dvh w-60 shrink-0 flex-col border-r border-border bg-card">
        <div className="flex items-start justify-between gap-2 px-5 pt-4 pb-3">
          <div>
            <p className="text-sm font-semibold">MAAX Inventory</p>
            <p className="text-xs text-muted">Min & Kin</p>
          </div>
          <ChevronDown className="mt-0.5 size-4 text-muted" aria-hidden />
        </div>
        <BranchSwitcher branches={allowedBranches} selected={branch} />
        <AppSidebar isAdmin={isAdmin} />
        <form action={signOut} className="mt-auto space-y-2 border-t border-border p-4">
          <p className="truncate text-xs text-muted">{email}</p>
          <button className={`${btnSecondaryClass} w-full`} type="submit">
            Sign out
          </button>
        </form>
      </aside>
      <main className="min-w-0 flex-1 px-6 py-8">{children}</main>
    </div>
  );
}
