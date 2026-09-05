"use client";

import { useState } from "react";
import { Check, Settings } from "lucide-react";
import { selectBranch } from "@/app/(app)/branch-actions";
import type { BranchOption } from "@/lib/auth";
import { cn } from "@/lib/utils";

export function BranchSwitcher({
  branches,
  selected,
}: {
  branches: BranchOption[];
  selected: BranchOption | null;
}) {
  const [open, setOpen] = useState(false);

  if (branches.length === 0) {
    return null;
  }

  return (
    <div className="relative px-3 pb-2">
      <button
        type="button"
        className="flex w-full items-center justify-between rounded-lg bg-slate-100 px-3 py-2 text-left"
        onClick={() => setOpen((value) => !value)}
      >
        <div>
          <p className="text-[10px] font-medium tracking-wide text-muted uppercase">Currently viewing</p>
          <p className="text-sm">{selected?.displayName ?? "No branch"}</p>
        </div>
        <Settings className="size-4 text-muted" aria-hidden />
      </button>

      {open ? (
        <div className="absolute inset-x-3 z-20 mt-1 rounded-lg border border-border bg-white py-1 shadow-lg">
          {branches.map((branch) => (
            <button
              key={branch.id}
              type="button"
              className={cn(
                "flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-slate-50",
                selected?.id === branch.id && "font-medium",
              )}
              onClick={async () => {
                setOpen(false);
                if (branch.id !== selected?.id) {
                  await selectBranch(branch.id);
                }
              }}
            >
              <span>{branch.displayName}</span>
              {selected?.id === branch.id ? <Check className="size-4" aria-hidden /> : null}
            </button>
          ))}
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
