"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { btnSecondaryClass, fieldClass } from "@/lib/ui";
import { cn } from "@/lib/utils";

export const NO_BRAND_SUB = "none";

export function BrandSubFilter({
  brand,
  options,
  selected,
  onChange,
  onCreate,
  disabled = false,
}: {
  brand: string;
  options: string[];
  selected: string[];
  onChange: (values: string[]) => void;
  onCreate: (name: string) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const rootRef = useRef<HTMLDivElement>(null);
  const needle = query.trim().toLowerCase();
  const chosen = useMemo(() => new Set(selected), [selected]);

  const matches = useMemo(
    () => options.filter((name) => !needle || name.toLowerCase().includes(needle)),
    [needle, options],
  );

  const canCreate = Boolean(
    brand &&
      query.trim() &&
      !options.some((name) => name.toLowerCase() === query.trim().toLowerCase()),
  );

  const summary = useMemo(() => {
    if (selected.length === 0) return "All product lines";
    const labels = selected.map((value) => (value === NO_BRAND_SUB ? "No Brand_sub" : value));
    if (labels.length === 1) return labels[0];
    if (labels.length === 2) return labels.join(", ");
    return `${labels.length} selected`;
  }, [selected]);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  function toggle(value: string) {
    if (chosen.has(value)) onChange(selected.filter((item) => item !== value));
    else onChange([...selected, value]);
  }

  if (!brand) {
    return (
      <label className="space-y-1 text-sm">
        <span>Brand_sub</span>
        <p className={cn(fieldClass, "text-muted")}>Select a brand to choose Brand_sub.</p>
      </label>
    );
  }

  return (
    <div className="relative space-y-1 text-sm" ref={rootRef}>
      <span>Brand_sub</span>
      <button
        className={cn(fieldClass, "flex items-center justify-between gap-2 text-left")}
        type="button"
        disabled={disabled}
        aria-expanded={open}
        aria-haspopup="listbox"
        onClick={() => setOpen((current) => !current)}
      >
        <span className={cn("truncate", selected.length === 0 && "text-muted")}>{summary}</span>
        <span aria-hidden="true" className="text-muted">
          {open ? "▴" : "▾"}
        </span>
      </button>
      {open ? (
        <div className="absolute z-40 mt-1 w-full rounded-lg border border-border bg-white p-2 shadow-md">
          <input
            className={cn(fieldClass, "mb-2")}
            value={query}
            disabled={disabled}
            placeholder="Search or create Brand_sub"
            aria-label="Search Brand_sub"
            autoFocus
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && canCreate) {
                event.preventDefault();
                onCreate(query.trim());
                setQuery("");
              }
            }}
          />
          <div className="max-h-40 space-y-1 overflow-auto">
            <label className="flex items-center gap-2 rounded-md px-1 py-1 hover:bg-slate-50">
              <input
                type="checkbox"
                checked={chosen.has(NO_BRAND_SUB)}
                disabled={disabled}
                onChange={() => toggle(NO_BRAND_SUB)}
              />
              <span>No Brand_sub</span>
            </label>
            {matches.map((name) => (
              <label key={name} className="flex items-center gap-2 rounded-md px-1 py-1 hover:bg-slate-50">
                <input
                  type="checkbox"
                  checked={chosen.has(name)}
                  disabled={disabled}
                  onChange={() => toggle(name)}
                />
                <span className="truncate">{name}</span>
              </label>
            ))}
            {matches.length === 0 && !canCreate ? (
              <p className="px-1 py-1 text-muted">No Brand_sub for this brand.</p>
            ) : null}
          </div>
          {canCreate ? (
            <button
              className={cn(btnSecondaryClass, "mt-2 w-full")}
              type="button"
              disabled={disabled}
              onClick={() => {
                onCreate(query.trim());
                setQuery("");
              }}
            >
              Create “{query.trim()}”
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
