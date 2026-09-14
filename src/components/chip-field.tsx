"use client";

import { useMemo, useState } from "react";
import { cn } from "@/lib/utils";

export type ChipOption = { id: string; label: string };

export function ChipField({
  options,
  selectedIds,
  onChange,
  onCreate,
  compact = false,
  disabled = false,
  placeholder = "Add…",
  ariaLabel,
}: {
  options: ChipOption[];
  selectedIds: string[];
  onChange: (ids: string[]) => void;
  /** When provided, typing a name that matches nothing offers "Create '<name>'". */
  onCreate?: (label: string) => Promise<ChipOption | null | void>;
  compact?: boolean;
  disabled?: boolean;
  placeholder?: string;
  ariaLabel?: string;
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);

  const byId = useMemo(() => new Map(options.map((option) => [option.id, option])), [options]);
  const selected = selectedIds.flatMap((id) => {
    const option = byId.get(id);
    return option ? [option] : [];
  });
  const available = options.filter((option) => {
    if (selectedIds.includes(option.id)) return false;
    const needle = query.trim().toLowerCase();
    if (!needle) return true;
    return option.label.toLowerCase().includes(needle);
  });

  const trimmedQuery = query.trim();
  const canCreate = Boolean(
    onCreate && trimmedQuery && !options.some((option) => option.label.toLowerCase() === trimmedQuery.toLowerCase()),
  );

  function add(id: string) {
    if (!id || selectedIds.includes(id)) return;
    onChange([...selectedIds, id]);
    setQuery("");
    setOpen(false);
  }

  function remove(id: string) {
    onChange(selectedIds.filter((item) => item !== id));
  }

  async function createFromQuery() {
    if (!onCreate || !canCreate || creating) return;
    setCreating(true);
    try {
      const created = await onCreate(trimmedQuery);
      if (created) add(created.id);
      else setQuery("");
    } finally {
      setCreating(false);
    }
  }

  function pickFromQuery() {
    const needle = query.trim().toLowerCase();
    const exact = available.find((option) => option.label.toLowerCase() === needle);
    const next = exact ?? available[0];
    if (next) {
      add(next.id);
    } else if (canCreate) {
      void createFromQuery();
    }
  }

  return (
    <div className="relative min-w-0">
      <div
        className={cn(
          "flex min-h-9 flex-wrap items-center gap-1 rounded-lg border border-border bg-white px-1.5 py-1",
          compact && "min-h-8 py-0.5",
        )}
      >
        {selected.map((option) => (
          <span
            key={option.id}
            className="inline-flex items-center gap-1 rounded-full bg-slate-900 px-2.5 py-0.5 text-sm font-medium text-white"
          >
            {option.label}
            <button
              className="leading-none opacity-80 hover:opacity-100"
              type="button"
              disabled={disabled}
              onClick={() => remove(option.id)}
              aria-label={`Remove ${option.label}`}
            >
              ×
            </button>
          </span>
        ))}
        <input
          className="min-w-16 flex-1 bg-transparent text-sm outline-none placeholder:text-muted"
          value={query}
          disabled={disabled || creating}
          placeholder={selected.length === 0 ? placeholder : ""}
          aria-label={ariaLabel ?? placeholder}
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
      {open && (available.length > 0 || canCreate) ? (
        <ul className="absolute z-50 mt-1 max-h-40 w-full overflow-auto rounded-lg border border-border bg-white py-1 shadow-md">
          {available.map((option) => (
            <li key={option.id}>
              <button
                className="w-full px-2 py-1.5 text-left text-sm hover:bg-slate-50"
                type="button"
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => add(option.id)}
              >
                {option.label}
              </button>
            </li>
          ))}
          {canCreate ? (
            <li>
              <button
                className="w-full px-2 py-1.5 text-left text-sm font-medium text-blue-600 hover:bg-slate-50"
                type="button"
                disabled={creating}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => void createFromQuery()}
              >
                {creating ? "Creating…" : `Create "${trimmedQuery}"`}
              </button>
            </li>
          ) : null}
        </ul>
      ) : null}
    </div>
  );
}
