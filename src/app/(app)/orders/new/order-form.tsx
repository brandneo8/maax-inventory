"use client";

import { useMemo, useState } from "react";
import { createPurchaseOrder } from "../actions";
import { btnClass, btnSecondaryClass, fieldClass } from "@/lib/ui";
import { emptyLine, OrderLineRow, type EditableLine } from "../order-line-row";
import type { Option, ProductOption } from "@/components/product-picker";

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
  const [lines, setLines] = useState<EditableLine[]>([emptyLine()]);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  function updateLine(key: string, patch: Partial<EditableLine>) {
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
        lines: lines.map((line) => ({
          product_id: line.product_id,
          classification: line.classification,
          quantity_ordered: line.quantity_ordered,
          unit_price: line.unit_price,
        })),
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
            <OrderLineRow
              key={line.key}
              line={line}
              products={products}
              onChange={(patch) => updateLine(line.key, patch)}
              onRemove={() => setLines((current) => current.filter((item) => item.key !== line.key))}
              removable={lines.length > 1}
            />
          ))}
        </div>
      </div>

      <button className={btnClass} disabled={pending} type="submit">
        {pending ? "Saving…" : "Save draft order"}
      </button>
    </form>
  );
}
