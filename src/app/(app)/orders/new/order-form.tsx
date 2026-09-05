"use client";

import { useMemo, useState } from "react";
import { createPurchaseOrder, type OrderLineInput } from "../actions";
import { CLASSIFICATIONS, type ProductClassification } from "@/lib/labels";
import { btnClass, btnSecondaryClass, fieldClass } from "@/lib/ui";

type Option = { id: string; label: string };
type ProductOption = Option & { defaultClassification: ProductClassification | null; unitCost: number };

type Line = OrderLineInput & { key: string };

function emptyLine(product?: ProductOption): Line {
  return {
    key: crypto.randomUUID(),
    product_id: product?.id ?? "",
    classification: product?.defaultClassification ?? "retail",
    quantity_ordered: 1,
    unit_price: product?.unitCost ?? 0,
  };
}

export function OrderForm({
  branchId,
  suppliers,
  products,
}: {
  branchId: string;
  suppliers: Option[];
  products: ProductOption[];
}) {
  const today = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const [lines, setLines] = useState<Line[]>([emptyLine()]);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  function updateLine(key: string, patch: Partial<Line>) {
    setLines((current) => current.map((line) => (line.key === key ? { ...line, ...patch } : line)));
  }

  async function onSubmit(formData: FormData) {
    setPending(true);
    setError(null);
    try {
      await createPurchaseOrder({
        branch_id: branchId,
        supplier_id: String(formData.get("supplier_id") ?? ""),
        order_date: String(formData.get("order_date") ?? ""),
        expected_delivery_date: String(formData.get("expected_delivery_date") ?? ""),
        notes: String(formData.get("notes") ?? ""),
        lines: lines.map(({ key: _key, ...line }) => line),
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create the order.");
      setPending(false);
    }
  }

  return (
    <form action={onSubmit} className="space-y-6">
      {error ? (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p>
      ) : null}

      <div className="grid gap-3 rounded-xl border border-border bg-card p-4 md:grid-cols-2">
        <label className="space-y-1 text-sm">
          <span>Supplier</span>
          <select className={fieldClass} name="supplier_id" required defaultValue="">
            <option value="" disabled>
              Select supplier
            </option>
            {suppliers.map((supplier) => (
              <option key={supplier.id} value={supplier.id}>
                {supplier.label}
              </option>
            ))}
          </select>
        </label>
        <label className="space-y-1 text-sm">
          <span>Order date</span>
          <input className={fieldClass} type="date" name="order_date" defaultValue={today} />
        </label>
        <label className="space-y-1 text-sm">
          <span>Expected delivery</span>
          <input className={fieldClass} type="date" name="expected_delivery_date" />
        </label>
        <label className="space-y-1 text-sm md:col-span-2">
          <span>Notes</span>
          <textarea className={fieldClass} name="notes" rows={2} />
        </label>
      </div>

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Lines</h2>
          <button
            className={btnSecondaryClass}
            type="button"
            onClick={() => setLines((current) => [...current, emptyLine()])}
          >
            Add line
          </button>
        </div>

        <div className="space-y-3">
          {lines.map((line) => (
            <div key={line.key} className="grid gap-3 rounded-xl border border-border bg-card p-4 md:grid-cols-4">
              <label className="space-y-1 text-sm md:col-span-2">
                <span>Product</span>
                <select
                  className={fieldClass}
                  value={line.product_id}
                  onChange={(event) => {
                    const product = products.find((item) => item.id === event.target.value);
                    updateLine(line.key, {
                      product_id: event.target.value,
                      classification: product?.defaultClassification ?? line.classification,
                      unit_price: product?.unitCost ?? line.unit_price,
                    });
                  }}
                  required
                >
                  <option value="">Select product</option>
                  {products.map((product) => (
                    <option key={product.id} value={product.id}>
                      {product.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="space-y-1 text-sm">
                <span>Type</span>
                <select
                  className={fieldClass}
                  value={line.classification}
                  onChange={(event) =>
                    updateLine(line.key, {
                      classification: event.target.value as ProductClassification,
                    })
                  }
                >
                  {CLASSIFICATIONS.map((item) => (
                    <option key={item.value} value={item.value}>
                      {item.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="space-y-1 text-sm">
                <span>Qty</span>
                <input
                  className={fieldClass}
                  type="number"
                  min="0.01"
                  step="0.01"
                  value={line.quantity_ordered}
                  onChange={(event) =>
                    updateLine(line.key, { quantity_ordered: Number(event.target.value) })
                  }
                />
              </label>
              <label className="space-y-1 text-sm">
                <span>Unit price</span>
                <input
                  className={fieldClass}
                  type="number"
                  min="0"
                  step="0.01"
                  value={line.unit_price}
                  onChange={(event) => updateLine(line.key, { unit_price: Number(event.target.value) })}
                />
              </label>
              {lines.length > 1 ? (
                <button
                  className="text-left text-sm text-muted underline md:col-span-3"
                  type="button"
                  onClick={() => setLines((current) => current.filter((item) => item.key !== line.key))}
                >
                  Remove line
                </button>
              ) : null}
            </div>
          ))}
        </div>
      </div>

      <button className={btnClass} disabled={pending} type="submit">
        {pending ? "Saving…" : "Save draft order"}
      </button>
    </form>
  );
}
