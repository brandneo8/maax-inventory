"use client";

import { useState } from "react";
import { ChevronDown, ChevronUp, Trash2 } from "lucide-react";
import { classificationLabel, type ProductClassification } from "@/lib/labels";
import { blurOnWheel, btnClass, fieldClass, numberFieldClass, tableClass, tdClass, thClass } from "@/lib/ui";
import { ProductPicker, type ProductOption } from "@/components/product-picker";
import { catalogTax } from "@/lib/catalog-pricing";
import { formatMoney } from "@/lib/format";
import { cn } from "@/lib/utils";

export type EditableLine = {
  key: string;
  product_id: string;
  classification: ProductClassification;
  quantity_ordered: number;
  unit_price: number;
};

export function emptyLine(product?: ProductOption): EditableLine {
  return {
    key: crypto.randomUUID(),
    product_id: product?.id ?? "",
    classification: product?.defaultClassification ?? "retail",
    quantity_ordered: 1,
    unit_price: product?.unitCost ?? 0,
  };
}

export function AddOrderLine({
  products,
  onAdd,
}: {
  products: ProductOption[];
  onAdd: (line: EditableLine) => void;
}) {
  const [productId, setProductId] = useState("");
  const [quantity, setQuantity] = useState(1);

  const selected = products.find((product) => product.id === productId);
  const canAdd = Boolean(selected) && quantity > 0;

  function handleAdd() {
    if (!selected || !canAdd) return;
    onAdd({ ...emptyLine(selected), quantity_ordered: quantity });
    setProductId("");
    setQuantity(1);
  }

  return (
    <div className="flex flex-wrap items-end gap-2 rounded-xl border border-border bg-card p-3">
      <label className="min-w-64 flex-1 space-y-1 text-sm">
        <span>Search product</span>
        <ProductPicker products={products} value={productId} onSelect={(product) => setProductId(product.id)} />
      </label>
      <div className="w-20 space-y-1 text-sm">
        <span className="text-muted">Size</span>
        <p className="px-3 py-2 text-sm">{selected?.sizeLabel || "—"}</p>
      </div>
      <label className="w-28 space-y-1 text-sm">
        <span>Quantity</span>
        <input
          className={cn(fieldClass, numberFieldClass)}
          type="number"
          min="1"
          step="1"
          value={quantity === 0 ? "" : quantity}
          onWheel={blurOnWheel}
          onChange={(event) => {
            const raw = event.target.value;
            if (raw === "") {
              setQuantity(0);
              return;
            }
            const parsed = Math.round(Number(raw));
            if (Number.isFinite(parsed)) setQuantity(Math.max(0, parsed));
          }}
          onBlur={() => {
            if (!quantity) setQuantity(1);
          }}
        />
      </label>
      <button className={btnClass} type="button" onClick={handleAdd} disabled={!canAdd}>
        Add
      </button>
    </div>
  );
}

export function OrderLinesTable({
  lines,
  products,
  gstRegistered,
  gstRate,
  onChange,
  onRemove,
  onMove,
}: {
  lines: EditableLine[];
  products: ProductOption[];
  gstRegistered: boolean;
  gstRate: number;
  onChange: (key: string, patch: Partial<EditableLine>) => void;
  onRemove: (key: string) => void;
  onMove: (key: string, direction: "up" | "down") => void;
}) {
  if (lines.length === 0) {
    return (
      <p className="rounded-xl border border-dashed border-border p-4 text-center text-sm text-muted">
        Search for a product above to add the first line.
      </p>
    );
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-border bg-card">
      <table className={cn(tableClass, "table-fixed")}>
        <thead>
          <tr>
            <th className={cn(thClass, "w-[10%]")}>SKU</th>
            <th className={cn(thClass, "w-[18%]")}>Product</th>
            <th className={thClass}>Size</th>
            <th className={thClass}>Type</th>
            <th className={cn(thClass, "w-[12%]")}>Tags</th>
            <th className={thClass}>Qty</th>
            <th className={thClass}>Unit price</th>
            <th className={thClass}>Avg paid here</th>
            <th className={thClass}>Price incl. GST</th>
            <th className={thClass}>Total price</th>
            <th className={cn(thClass, "w-[7%]")} />
          </tr>
        </thead>
        <tbody>
          {lines.map((line, index) => {
            const product = products.find((item) => item.id === line.product_id);
            const unitPrice = Number(line.unit_price) || 0;
            const quantity = Number(line.quantity_ordered) || 0;
            const priceWithTax = catalogTax(unitPrice, gstRegistered, gstRate).unitCostWithTax;
            const totalPrice = unitPrice * quantity;
            return (
              <tr key={line.key}>
                <td className={tdClass}>{product?.sku || "—"}</td>
                <td className={tdClass}>{product?.label ?? "—"}</td>
                <td className={tdClass}>{product?.sizeLabel || "—"}</td>
                <td className={tdClass}>{classificationLabel(line.classification)}</td>
                <td className={tdClass}>{product?.tagNames?.filter(Boolean).join(", ") || "—"}</td>
                <td className={tdClass}>
                  <input
                    className={cn(fieldClass, numberFieldClass)}
                    type="number"
                    min="1"
                    step="1"
                    value={line.quantity_ordered === 0 ? "" : line.quantity_ordered}
                    onWheel={blurOnWheel}
                    onChange={(event) => {
                      const raw = event.target.value;
                      if (raw === "") {
                        onChange(line.key, { quantity_ordered: 0 });
                        return;
                      }
                      const parsed = Math.round(Number(raw));
                      if (!Number.isFinite(parsed)) return;
                      onChange(line.key, { quantity_ordered: Math.max(0, parsed) });
                    }}
                    onBlur={() => {
                      if (!line.quantity_ordered) onChange(line.key, { quantity_ordered: 1 });
                    }}
                  />
                </td>
                <td className={tdClass}>
                  <input
                    className={cn(fieldClass, numberFieldClass)}
                    type="number"
                    min="0"
                    step="0.01"
                    value={line.unit_price === 0 ? "" : line.unit_price}
                    onWheel={blurOnWheel}
                    onChange={(event) => {
                      const raw = event.target.value;
                      if (raw === "") {
                        onChange(line.key, { unit_price: 0 });
                        return;
                      }
                      const parsed = Number(raw);
                      if (!Number.isFinite(parsed)) return;
                      onChange(line.key, { unit_price: Math.max(0, parsed) });
                    }}
                  />
                </td>
                <td className={tdClass}>
                  {product?.branchAvgCost != null ? formatMoney(product.branchAvgCost) : "—"}
                </td>
                <td className={tdClass}>{formatMoney(priceWithTax)}</td>
                <td className={tdClass}>{formatMoney(totalPrice)}</td>
                <td className={tdClass}>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      className="text-muted hover:text-slate-700 disabled:opacity-30"
                      onClick={() => onMove(line.key, "up")}
                      disabled={index === 0}
                      aria-label="Move line up"
                    >
                      <ChevronUp className="size-4" aria-hidden />
                    </button>
                    <button
                      type="button"
                      className="text-muted hover:text-slate-700 disabled:opacity-30"
                      onClick={() => onMove(line.key, "down")}
                      disabled={index === lines.length - 1}
                      aria-label="Move line down"
                    >
                      <ChevronDown className="size-4" aria-hidden />
                    </button>
                    <button
                      type="button"
                      className="text-red-600 hover:text-red-800"
                      onClick={() => onRemove(line.key)}
                      aria-label="Remove line"
                    >
                      <Trash2 className="size-4" aria-hidden />
                    </button>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
