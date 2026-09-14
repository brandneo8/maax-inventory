"use client";

import { useState } from "react";
import { Trash2 } from "lucide-react";
import { fieldClass, btnClass, tableClass, tdClass, thClass } from "@/lib/ui";
import { formatQty } from "@/lib/format";
import { cn } from "@/lib/utils";
import { ProductPicker, type Option } from "@/components/product-picker";

export type StockOutLine = { key: string; product_id: string; quantity_used: number; entry_date: string };

function clampToNonNegativeInteger(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.round(value));
}

function clampDateToMax(date: string, maxDate: string) {
  if (!date) return maxDate;
  return date > maxDate ? maxDate : date;
}

function AddStockOutLine({
  products,
  reportDate,
  onAdd,
}: {
  products: Option[];
  reportDate: string;
  onAdd: (productId: string, quantity: number, useDate: string) => void;
}) {
  const [productId, setProductId] = useState("");
  const [quantity, setQuantity] = useState(1);
  const [useDate, setUseDate] = useState(reportDate);

  const canAdd = Boolean(productId) && quantity > 0 && Boolean(useDate) && useDate <= reportDate;

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
        <span>Use date</span>
        <input
          className={fieldClass}
          type="date"
          max={reportDate}
          value={useDate}
          onChange={(event) => setUseDate(clampDateToMax(event.target.value, reportDate))}
        />
      </label>
      <label className="w-32 space-y-1 text-sm">
        <span>Quantity</span>
        <input
          className={fieldClass}
          type="number"
          min="0"
          step="1"
          value={quantity}
          onChange={(event) => setQuantity(clampToNonNegativeInteger(Number(event.target.value)))}
        />
      </label>
      <button className={btnClass} type="button" onClick={handleAdd} disabled={!canAdd}>
        Add
      </button>
    </div>
  );
}

export function StockOutLinesEditor({
  products,
  reportDate,
  lines,
  onLinesChange,
}: {
  products: Option[];
  reportDate: string;
  lines: StockOutLine[];
  onLinesChange: (lines: StockOutLine[]) => void;
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
    onLinesChange(
      lines.map((line) => (line.key === key ? { ...line, quantity_used: clampToNonNegativeInteger(quantity) } : line)),
    );
  }

  function updateDate(key: string, date: string) {
    onLinesChange(
      lines.map((line) => (line.key === key ? { ...line, entry_date: clampDateToMax(date, reportDate) } : line)),
    );
  }

  function removeLine(key: string) {
    onLinesChange(lines.filter((line) => line.key !== key));
  }

  return (
    <div className="space-y-3">
      <AddStockOutLine products={products} reportDate={reportDate} onAdd={addLine} />

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
                <th className={thClass}>Use date</th>
                <th className={cn(thClass, "w-1/5 text-right")}>Quantity used</th>
                <th className={thClass} />
              </tr>
            </thead>
            <tbody>
              {lines.map((line) => {
                const product = products.find((item) => item.id === line.product_id);
                const label = product?.label ?? "Unknown product";
                return (
                  <tr key={line.key}>
                    <td className={tdClass}>{label}</td>
                    <td className={tdClass}>{product?.tagNames?.filter(Boolean).join(", ") || "—"}</td>
                    <td className={tdClass}>
                      <input
                        className={fieldClass}
                        type="date"
                        max={reportDate}
                        value={line.entry_date}
                        onChange={(event) => updateDate(line.key, event.target.value)}
                      />
                    </td>
                    <td className={cn(tdClass, "w-1/5")}>
                      <input
                        className={cn(fieldClass, "text-right text-red-600")}
                        type="number"
                        min="0"
                        step="1"
                        value={line.quantity_used}
                        onChange={(event) => updateQuantity(line.key, Number(event.target.value))}
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
