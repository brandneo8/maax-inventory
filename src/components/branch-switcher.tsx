"use client";

import { useState, useTransition } from "react";
import { usePathname } from "next/navigation";
import { Check, ChevronDown } from "lucide-react";
import { selectBranch } from "@/app/(app)/branch-actions";
import type { BranchOption } from "@/lib/auth";
import { cn } from "@/lib/utils";

export function BranchSwitcher({
  branches,
  selected,
  collapsed = false,
}: {
  branches: BranchOption[];
  selected: BranchOption | null;
  collapsed?: boolean;
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  if (branches.length === 0) {
    return collapsed ? null : (
      <div className="rounded-lg bg-slate-100 px-3.5 py-3">
        <p className="text-[10px] font-medium tracking-wide text-muted uppercase">Currently viewing</p>
        <p className="mt-1.5 text-sm leading-5">No branch assigned</p>
      </div>
    );
  }

  const label = pending ? "Switching salon…" : (selected?.displayName ?? "Choose a branch");

  return (
    <div className="relative w-full">
      <button
        type="button"
        className={cn(
          "flex w-full items-center rounded-lg bg-slate-100 text-left",
          collapsed ? "justify-center px-2 py-2" : "justify-between gap-3 px-3.5 py-3",
        )}
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-label={label}
        title={label}
        disabled={pending}
        onClick={() => setOpen((value) => !value)}
      >
        {collapsed ? (
          <span className="text-sm font-medium">{(selected?.displayName ?? "?").slice(0, 1)}</span>
        ) : (
          <>
            <div className="space-y-1.5">
              <p className="text-[10px] font-medium tracking-wide text-muted uppercase">Currently viewing</p>
              <p className="text-sm leading-5 font-medium">{label}</p>
            </div>
            <ChevronDown className={cn("size-4 shrink-0 text-muted transition-transform", open && "rotate-180")} aria-hidden />
          </>
        )}
      </button>

      {open ? (
        <div
          className={cn(
            "absolute z-20 mt-2 rounded-lg border border-border bg-white py-1.5 shadow-lg",
            collapsed ? "left-full top-0 ml-2 w-44" : "inset-x-0",
          )}
          role="listbox"
        >
          {branches.map((branch) => {
            const isSelected = selected?.id === branch.id;
            return (
              <button
                key={branch.id}
                type="button"
                role="option"
                aria-selected={isSelected}
                disabled={pending}
                className={cn(
                  "flex w-full items-center justify-between px-3.5 py-2.5 text-left text-sm hover:bg-slate-50",
                  isSelected && "font-medium",
                )}
                onClick={() => {
                  setOpen(false);
                  if (isSelected) return;
                  startTransition(async () => {
                    await selectBranch(branch.id);
                    window.location.assign(pathname || "/home");
                  });
                }}
              >
                <span>{branch.displayName}</span>
                {isSelected ? <Check className="size-4" aria-hidden /> : null}
              </button>
            );
          })}
        </div>
      ) : null}

      {open ? (
        <button
          type="button"
          className="fixed inset-0 z-10 cursor-default"
          aria-label="Close branch menu"
          onClick={() => setOpen(false)}
        />
      ) : null}
    </div>
  );
}
