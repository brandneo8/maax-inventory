"use client";

import { useMemo, useState } from "react";
import { salonChipLabel } from "@/lib/labels";
import { cn } from "@/lib/utils";

type BranchOption = { id: string; name: string };

export function SalonChipField({
  branches,
  selectedIds,
  onChange,
  compact = false,
  disabled = false,
  ariaLabel,
}: {
  branches: BranchOption[];
  selectedIds: string[];
  onChange: (ids: string[]) => void;
  compact?: boolean;
  disabled?: boolean;
  ariaLabel?: string;
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);

  const byId = useMemo(() => new Map(branches.map((branch) => [branch.id, branch])), [branches]);
  const selected = selectedIds.flatMap((id) => {
    const branch = byId.get(id);
    return branch ? [branch] : [];
  });
  const available = branches.filter((branch) => {
    if (selectedIds.includes(branch.id)) return false;
    const needle = query.trim().toLowerCase();
    if (!needle) return true;
    return (
      salonChipLabel(branch.name).includes(needle) || branch.name.toLowerCase().includes(needle)
    );
  });

  function add(id: string) {
    if (!id || selectedIds.includes(id)) return;
    onChange([...selectedIds, id]);
    setQuery("");
    setOpen(false);
  }

  function remove(id: string) {
    onChange(selectedIds.filter((item) => item !== id));
  }

  function pickFromQuery() {
    const needle = query.trim().toLowerCase();
    const exact = available.find((branch) => salonChipLabel(branch.name) === needle);
    const next = exact ?? available[0];
    if (next) add(next.id);
  }

  return (
    <div className="relative min-w-0">
      <div
        className={cn(
          "flex min-h-9 flex-wrap items-center gap-1 rounded-lg border border-border bg-white px-1.5 py-1",
          compact && "min-h-8 py-0.5",
        )}
      >
        {selected.map((branch) => {
          const label = salonChipLabel(branch.name);
          return (
            <span
              key={branch.id}
              className="inline-flex items-center gap-1 rounded-full bg-slate-900 px-2.5 py-0.5 text-sm font-medium text-white"
            >
              {label}
              <button
                className="leading-none opacity-80 hover:opacity-100"
                type="button"
                disabled={disabled}
                onClick={() => remove(branch.id)}
                aria-label={`Remove ${label}`}
              >
                ×
              </button>
            </span>
          );
        })}
        <input
          className="min-w-16 flex-1 bg-transparent text-sm outline-none placeholder:text-muted"
          value={query}
          disabled={disabled}
          placeholder={selected.length === 0 ? "Add min or kin" : ""}
          aria-label={ariaLabel ?? "Add salon"}
          onChange={(event) => {
            setQuery(event.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => window.setTimeout(() => setOpen(false), 120)}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === ",") {
              event.preventDefault();
              pickFromQuery();
            } else if (event.key === "Backspace" && !query && selectedIds.length > 0) {
              remove(selectedIds[selectedIds.length - 1]!);
            } else if (event.key === "Escape") {
              setOpen(false);
            }
          }}
        />
      </div>
      {open && available.length > 0 ? (
        <ul className="absolute z-50 mt-1 max-h-40 w-full overflow-auto rounded-lg border border-border bg-white py-1 shadow-md">
          {available.map((branch) => {
            const label = salonChipLabel(branch.name);
            return (
              <li key={branch.id}>
                <button
                  className="w-full px-2 py-1.5 text-left text-sm hover:bg-slate-50"
                  type="button"
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => add(branch.id)}
                >
                  {label}
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}
