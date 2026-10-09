"use client";

import { useState, type KeyboardEvent } from "react";
import { Trash2 } from "lucide-react";
import { fieldClass, btnClass, tableClass, tdClass, thClass } from "@/lib/ui";
import { formatQty } from "@/lib/format";
import { cn } from "@/lib/utils";
import { ProductPicker, type Option } from "@/components/product-picker";

/** A line being edited; `id` is set for a line already saved (unchanged ones keep their count-coverage marks). */
export type StockOutLine = { key: string; id?: string; product_id: string; quantity_used: number; entry_date: string };

/** Why the lines can't be saved yet, if anything. */
export function stockOutLinesProblem(lines: StockOutLine[]) {
  if (lines.length === 0) return "Add at least one line.";
  if (lines.some((line) => !Number.isInteger(line.quantity_used) || line.quantity_used <= 0)) {
    return "Every line needs a quantity of at least 1 — enter one or remove the line.";
  }
  return null;
}

/** Keeps an open date inside the stock-out's period. */
function clampDate(date: string, minDate: string, maxDate: string) {
  if (date > maxDate) return maxDate;
  if (date < minDate) return minDate;
  return date;
}

const isFullDate = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value);

/**
 * A date box limited to [min, max]. While typing, browsers report partial
 * dates (e.g. year "0002"); those are left alone and only a complete date
 * inside the range is passed on. On leaving the box, anything else snaps back
 * into range (or to the last good date).
 */
export function PeriodDateInput({
  value,
  min,
  max,
  onChange,
  className,
  id,
  ariaLabel,
  onEnter,
}: {
  value: string;
  min: string;
  max: string;
  onChange: (date: string) => void;
  className?: string;
  id?: string;
  ariaLabel?: string;
  onEnter?: () => void;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const shown = draft ?? value;
  return (
    <input
      id={id}
      className={cn(fieldClass, className)}
      type="date"
      min={min}
      max={max}
      value={shown}
      aria-label={ariaLabel}
      onChange={(event) => {
        const next = event.target.value;
        setDraft(next);
        if (isFullDate(next) && next >= min && next <= max) onChange(next);
      }}
      onBlur={() => {
        if (draft == null) return;
        if (isFullDate(draft) && draft !== value) onChange(clampDate(draft, min, max));
        setDraft(null);
      }}
      onKeyDown={(event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          onEnter?.();
        }
      }}
    />
  );
}

/** A whole-number box that can be cleared while typing; an empty box counts as 0 (and blocks saving). */
function QuantityInput({
  value,
  onChange,
  className,
  ariaLabel,
  onEnter,
}: {
  value: number;
  onChange: (quantity: number) => void;
  className?: string;
  ariaLabel?: string;
  onEnter?: () => void;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  return (
    <input
      className={cn(fieldClass, className)}
      type="number"
      inputMode="numeric"
      min="1"
      step="1"
      value={draft ?? String(value)}
      aria-label={ariaLabel}
      aria-invalid={value <= 0 || undefined}
      onChange={(event) => {
        const raw = event.target.value;
        setDraft(raw);
        const parsed = Number(raw);
        onChange(raw.trim() === "" || !Number.isFinite(parsed) ? 0 : Math.max(0, Math.round(parsed)));
      }}
      onBlur={() => setDraft(null)}
      onKeyDown={(event: KeyboardEvent<HTMLInputElement>) => {
        if (event.key === "Enter") {
          event.preventDefault();
          onEnter?.();
        }
      }}
    />
  );
}

function AddStockOutLine({
  products,
  periodStart,
  reportDate,
  onAdd,
}: {
  products: Option[];
  periodStart: string;
  reportDate: string;
  onAdd: (productId: string, quantity: number, useDate: string) => void;
}) {
  const [productId, setProductId] = useState("");
  const [quantity, setQuantity] = useState(1);
  const [pickedDate, setUseDate] = useState(reportDate);
  // Follows the period if it changes after a date was picked.
  const useDate = clampDate(pickedDate, periodStart, reportDate);

  const canAdd = Boolean(productId) && quantity > 0 && Boolean(useDate);

  function handleAdd() {
    if (!canAdd) return;
    onAdd(productId, quantity, useDate);
    setProductId("");
    setQuantity(1);
    setUseDate(reportDate);
  }

  return (
    <div className="flex flex-wrap items-end gap-2 rounded-xl border border-border bg-card p-3">
      <label className="min-w-64 flex-1 space-y-1 text-sm">
        <span>Search product</span>
        <ProductPicker products={products} value={productId} onSelect={(product) => setProductId(product.id)} />
      </label>
      <label className="w-40 space-y-1 text-sm">
        <span>Open date</span>
        <PeriodDateInput value={useDate} min={periodStart} max={reportDate} onChange={setUseDate} onEnter={handleAdd} />
      </label>
      <label className="w-32 space-y-1 text-sm">
        <span>Quantity</span>
        <QuantityInput value={quantity} onChange={setQuantity} onEnter={handleAdd} />
      </label>
      <button className={btnClass} type="button" onClick={handleAdd} disabled={!canAdd}>
        Add
      </button>
    </div>
  );
}

export function StockOutLinesEditor({
  products,
  periodStart,
  reportDate,
  lines,
  onLinesChange,
  savedLabels,
}: {
  products: Option[];
  /** First day of the stock-out period — open dates can't be earlier. */
  periodStart: string;
  /** Last day of the period (the stock-out's end date). */
  reportDate: string;
  lines: StockOutLine[];
  onLinesChange: (lines: StockOutLine[]) => void;
  /** Names of saved lines' products, for products no longer on the in-house list. */
  savedLabels?: Map<string, string>;
}) {
  function addLine(productId: string, quantity: number, useDate: string) {
    const existingIndex = lines.findIndex(
      (line) => line.product_id === productId && line.entry_date === useDate,
    );
    if (existingIndex >= 0) {
      onLinesChange(
        lines.map((line, index) =>
          index === existingIndex ? { ...line, quantity_used: line.quantity_used + quantity } : line,
        ),
      );
      return;
    }
    onLinesChange([
      ...lines,
      { key: crypto.randomUUID(), product_id: productId, quantity_used: quantity, entry_date: useDate },
    ]);
  }

  function updateQuantity(key: string, quantity: number) {
    onLinesChange(lines.map((line) => (line.key === key ? { ...line, quantity_used: quantity } : line)));
  }

  function updateDate(key: string, date: string) {
    onLinesChange(lines.map((line) => (line.key === key ? { ...line, entry_date: date } : line)));
  }

  function removeLine(key: string) {
    onLinesChange(lines.filter((line) => line.key !== key));
  }

  return (
    <div className="space-y-3">
      <AddStockOutLine products={products} periodStart={periodStart} reportDate={reportDate} onAdd={addLine} />

      {lines.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border bg-card p-4 text-sm text-muted">
          Search for a product above to add it to this stock-out.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border bg-card">
          <table className={tableClass}>
            <thead>
              <tr>
                <th className={thClass}>Product</th>
                <th className={thClass}>Tags</th>
                <th className={thClass}>Open date</th>
                <th className={cn(thClass, "w-1/5 text-right")}>Quantity used</th>
                <th className={thClass} />
              </tr>
            </thead>
            <tbody>
              {lines.map((line) => {
                const product = products.find((item) => item.id === line.product_id);
                const label = product?.label ?? savedLabels?.get(line.product_id) ?? "Unknown product";
                return (
                  <tr key={line.key}>
                    <td className={tdClass}>{label}</td>
                    <td className={tdClass}>{product?.tagNames?.filter(Boolean).join(", ") || "—"}</td>
                    <td className={tdClass}>
                      <PeriodDateInput
                        value={line.entry_date}
                        min={periodStart}
                        max={reportDate}
                        onChange={(date) => updateDate(line.key, date)}
                        ariaLabel={`Open date for ${label}`}
                      />
                    </td>
                    <td className={cn(tdClass, "w-1/5")}>
                      <QuantityInput
                        className={cn(
                          "text-right text-red-600",
                          line.quantity_used <= 0 && "border-red-400 bg-red-50",
                        )}
                        value={line.quantity_used}
                        onChange={(quantity) => updateQuantity(line.key, quantity)}
                        ariaLabel={`Quantity used of ${label}`}
                      />
                    </td>
                    <td className={tdClass}>
                      <button
                        type="button"
                        className="text-red-600 hover:text-red-800"
                        onClick={() => removeLine(line.key)}
                        aria-label={`Remove ${label}`}
                      >
                        <Trash2 className="size-4" aria-hidden />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export function StockOutQuantityDisplay({ quantityUsed }: { quantityUsed: number }) {
  return <span className="text-red-600">{formatQty(quantityUsed)}</span>;
}
