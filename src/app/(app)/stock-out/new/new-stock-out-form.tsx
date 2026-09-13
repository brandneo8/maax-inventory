"use client";

import { useMemo, useState } from "react";
import { recordStockOutReport, type StockOutType } from "../actions";
import { btnClass, fieldClass } from "@/lib/ui";
import { StockOutLinesEditor, type StockOutLine } from "../stock-out-lines-editor";
import { cn } from "@/lib/utils";
import type { Option } from "@/components/product-picker";

const TYPE_OPTIONS: { value: StockOutType; label: string; description: string }[] = [
  { value: "retail", label: "Retail use", description: "Products tagged Retail or GWP for this salon." },
  { value: "inhouse", label: "Inhouse use", description: "Products tagged In-house for this salon." },
];

export function NewStockOutForm({
  branchId,
  branchName,
  retailProducts,
  inhouseProducts,
}: {
  branchId: string;
  branchName: string;
  retailProducts: Option[];
  inhouseProducts: Option[];
}) {
  const today = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const [type, setType] = useState<StockOutType | null>(null);
  const [lines, setLines] = useState<StockOutLine[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const products = type === "retail" ? retailProducts : type === "inhouse" ? inhouseProducts : [];

  function selectType(next: StockOutType) {
    if (next === type) return;
    setType(next);
    setLines([]);
    setError(null);
  }

  async function onSubmit(formData: FormData) {
    if (!type) {
      setError("Select Retail use or Inhouse use first.");
      return;
    }
    setPending(true);
    setError(null);
    try {
      await recordStockOutReport({
        branch_id: branchId,
        type,
        entry_date: String(formData.get("entry_date") ?? ""),
        notes: String(formData.get("notes") ?? ""),
        lines: lines.map((line) => ({ product_id: line.product_id, quantity_used: line.quantity_used })),
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save this stock-out.");
      setPending(false);
    }
  }

  return (
    <form action={onSubmit} className="space-y-6">
      {error ? (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p>
      ) : null}

      <div className="space-y-2">
        <span className="text-sm font-medium">Type</span>
        <div className="grid gap-3 sm:grid-cols-2">
          {TYPE_OPTIONS.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => selectType(option.value)}
              className={cn(
                "rounded-xl border p-4 text-left",
                type === option.value ? "border-sky-400 bg-sky-50" : "border-border bg-card hover:bg-slate-50",
              )}
            >
              <p className="font-medium">{option.label}</p>
              <p className="mt-1 text-sm text-muted">{option.description}</p>
            </button>
          ))}
        </div>
      </div>

      <div className="grid gap-3 rounded-xl border border-border bg-card p-4 md:grid-cols-2">
        <label className="space-y-1 text-sm">
          <span>Entry date</span>
          <input className={fieldClass} type="date" name="entry_date" defaultValue={today} required />
        </label>
        <label className="space-y-1 text-sm">
          <span>Notes</span>
          <input className={fieldClass} name="notes" />
        </label>
      </div>

      <div className="space-y-3">
        <h2 className="text-lg font-semibold">Lines</h2>
        {!type ? (
          <p className="rounded-xl border border-dashed border-border bg-card p-4 text-sm text-muted">
            Select Retail use or Inhouse use above to add products.
          </p>
        ) : (
          <StockOutLinesEditor products={products} lines={lines} onLinesChange={setLines} />
        )}
      </div>

      <button className={btnClass} disabled={pending || !type || lines.length === 0} type="submit">
        {pending ? "Saving…" : `Save stock-out for ${branchName}`}
      </button>
    </form>
  );
}
