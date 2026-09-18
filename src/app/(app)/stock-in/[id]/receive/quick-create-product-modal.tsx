"use client";

import { useState } from "react";
import { quickCreateProduct } from "@/app/(app)/products/actions";
import { CLASSIFICATIONS, type ProductClassification } from "@/lib/labels";
import { blurOnWheel, btnClass, btnSecondaryClass, fieldClass, numberFieldClass } from "@/lib/ui";
import { cn } from "@/lib/utils";
import type { Option } from "@/components/product-picker";

export function QuickCreateProductModal({
  defaultClassification,
  onClose,
  onCreated,
}: {
  defaultClassification: ProductClassification;
  onClose: () => void;
  onCreated: (product: Option) => void;
}) {
  const [orderName, setOrderName] = useState("");
  const [sku, setSku] = useState("");
  const [brand, setBrand] = useState("");
  const [size, setSize] = useState("");
  const [unitCost, setUnitCost] = useState(0);
  const [classification, setClassification] = useState<ProductClassification>(defaultClassification);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    if (!orderName.trim()) {
      setError("Product name is required.");
      return;
    }
    setPending(true);
    setError(null);
    try {
      const product = await quickCreateProduct({
        order_name: orderName,
        sku,
        brand,
        size,
        unit_cost_price: unitCost,
        classification,
      });
      onCreated(product);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create the product.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md rounded-xl border border-border bg-white p-4 shadow-lg">
        <h2 className="text-lg font-semibold">Create product</h2>
        <p className="mt-1 text-sm text-muted">Add a new product to the catalog, then use it on this receipt.</p>

        {error ? (
          <p className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p>
        ) : null}

        <div className="mt-3 space-y-3">
          <label className="block space-y-1 text-sm">
            <span>Product name</span>
            <input
              className={fieldClass}
              value={orderName}
              onChange={(event) => setOrderName(event.target.value)}
              autoFocus
            />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="block space-y-1 text-sm">
              <span>SKU</span>
              <input className={fieldClass} value={sku} onChange={(event) => setSku(event.target.value)} />
            </label>
            <label className="block space-y-1 text-sm">
              <span>Brand</span>
              <input className={fieldClass} value={brand} onChange={(event) => setBrand(event.target.value)} />
            </label>
            <label className="block space-y-1 text-sm">
              <span>Size</span>
              <input
                className={fieldClass}
                value={size}
                onChange={(event) => setSize(event.target.value)}
                placeholder="e.g. 175ml"
              />
            </label>
            <label className="block space-y-1 text-sm">
              <span>Unit cost</span>
              <input
                className={cn(fieldClass, numberFieldClass)}
                type="number"
                min="0"
                step="0.01"
                value={unitCost === 0 ? "" : unitCost}
                onWheel={blurOnWheel}
                onChange={(event) => {
                  const raw = event.target.value;
                  if (raw === "") {
                    setUnitCost(0);
                    return;
                  }
                  const parsed = Number(raw);
                  if (Number.isFinite(parsed)) setUnitCost(Math.max(0, parsed));
                }}
              />
            </label>
          </div>
          <label className="block space-y-1 text-sm">
            <span>Type</span>
            <select
              className={fieldClass}
              value={classification}
              onChange={(event) => setClassification(event.target.value as ProductClassification)}
            >
              {CLASSIFICATIONS.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="mt-4 flex justify-end gap-2">
          <button className={btnSecondaryClass} type="button" onClick={onClose} disabled={pending}>
            Cancel
          </button>
          <button className={btnClass} type="button" onClick={() => void submit()} disabled={pending}>
            {pending ? "Creating…" : "Create product"}
          </button>
        </div>
      </div>
    </div>
  );
}
