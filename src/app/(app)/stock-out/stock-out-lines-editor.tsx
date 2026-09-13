"use client";

import { useState } from "react";
import { Trash2 } from "lucide-react";
import { fieldClass, btnClass, tableClass, tdClass, thClass } from "@/lib/ui";
import { formatQty } from "@/lib/format";
import { cn } from "@/lib/utils";
import { ProductPicker, type Option } from "@/components/product-picker";

export type StockOutLine = { key: string; product_id: string; quantity_used: number };

function clampToNonNegativeInteger(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.round(value));
}

function AddStockOutLine({
  products,
  onAdd,
}: {
  products: Option[];
  onAdd: (productId: string, quantity: number) => void;
}) {
  const [productId, setProductId] = useState("");
  const [quantity, setQuantity] = useState(1);

  const canAdd = Boolean(productId) && quantity > 0;

  function handleAdd() {
    if (!canAdd) return;
    onAdd(productId, quantity);
    setProductId("");
    setQuantity(1);
  }

  return (
    <div className="flex flex-wrap items-end gap-2 rounded-xl border border-border bg-card p-3">
      <label className="min-w-64 flex-1 space-y-1 text-sm">
        <span>Search product</span>
        <ProductPicker products={products} value={productId} onSelect={(product) => setProductId(product.id)} />
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
  lines,
  onLinesChange,
}: {
  products: Option[];
  lines: StockOutLine[];
  onLinesChange: (lines: StockOutLine[]) => void;
}) {
  function addLine(productId: string, quantity: number) {
    const existingIndex = lines.findIndex((line) => line.product_id === productId);
    if (existingIndex >= 0) {
      onLinesChange(
        lines.map((line, index) =>
          index === existingIndex ? { ...line, quantity_used: line.quantity_used + quantity } : line,
        ),
      );
      return;
    }
    onLinesChange([...lines, { key: crypto.randomUUID(), product_id: productId, quantity_used: quantity }]);
  }

  function updateQuantity(key: string, quantity: number) {
    onLinesChange(
      lines.map((line) => (line.key === key ? { ...line, quantity_used: clampToNonNegativeInteger(quantity) } : line)),
    );
  }

  function removeLine(key: string) {
    onLinesChange(lines.filter((line) => line.key !== key));
  }

  return (
    <div className="space-y-3">
      <AddStockOutLine products={products} onAdd={addLine} />

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
                <th className={cn(thClass, "w-1/5 text-right")}>Quantity used</th>
                <th className={thClass} />
              </tr>
            </thead>
            <tbody>
              {lines.map((line) => {
                const label = products.find((product) => product.id === line.product_id)?.label ?? "Unknown product";
                return (
                  <tr key={line.key}>
                    <td className={tdClass}>{label}</td>
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
