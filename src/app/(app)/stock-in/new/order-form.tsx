"use client";

import { useMemo, useState } from "react";
import { createPurchaseOrder } from "../actions";
import { btnClass, fieldClass } from "@/lib/ui";
import { AddOrderLine, OrderLinesTable, type EditableLine } from "../order-line-row";
import { OrderTotals } from "../order-totals";
import { BulkLineActionsBar } from "../bulk-line-actions";
import type { Option, ProductOption } from "@/components/product-picker";

type SupplierOption = Option & { gstRegistered: boolean };

export function OrderForm({
  branchId,
  suppliers,
  products,
  gstRate,
}: {
  branchId: string;
  suppliers: SupplierOption[];
  products: ProductOption[];
  gstRate: number;
}) {
  const today = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const [supplierId, setSupplierId] = useState("");
  const [lines, setLines] = useState<EditableLine[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const gstRegistered = suppliers.find((supplier) => supplier.id === supplierId)?.gstRegistered ?? false;
  const pickableProducts = useMemo(() => {
    if (!supplierId) return products;
    return products.filter((product) => !product.supplierIds?.length || product.supplierIds.includes(supplierId));
  }, [products, supplierId]);

  function updateLine(key: string, patch: Partial<EditableLine>) {
    setLines((current) => current.map((line) => (line.key === key ? { ...line, ...patch } : line)));
  }

  function removeLine(key: string) {
    setLines((current) => current.filter((line) => line.key !== key));
  }

  function moveLine(key: string, direction: "up" | "down") {
    setLines((current) => {
      const index = current.findIndex((line) => line.key === key);
      const targetIndex = direction === "up" ? index - 1 : index + 1;
      if (index < 0 || targetIndex < 0 || targetIndex >= current.length) return current;
      const next = [...current];
      [next[index], next[targetIndex]] = [next[targetIndex], next[index]];
      return next;
    });
  }

  function applyAvgCostToAll() {
    setLines((current) =>
      current.map((line) => {
        const product = products.find((item) => item.id === line.product_id);
        return product?.branchAvgCost != null ? { ...line, unit_price: product.branchAvgCost } : line;
      }),
    );
  }

  function applyBulkDiscount(percent: number) {
    const factor = 1 - Math.min(100, Math.max(0, percent)) / 100;
    setLines((current) =>
      current.map((line) => ({ ...line, unit_price: Math.round(line.unit_price * factor * 100) / 100 })),
    );
  }

  function applyBulkQuantity(qty: number) {
    setLines((current) => current.map((line) => ({ ...line, quantity_ordered: qty })));
  }

  function applyBulkUnitPrice(price: number) {
    setLines((current) => current.map((line) => ({ ...line, unit_price: price })));
  }

  async function onSubmit(formData: FormData) {
    setPending(true);
    setError(null);
    try {
      await createPurchaseOrder({
        branch_id: branchId,
        supplier_id: String(formData.get("supplier_id") ?? ""),
        order_date: String(formData.get("order_date") ?? ""),
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
          <select
            className={fieldClass}
            name="supplier_id"
            required
            value={supplierId}
            onChange={(event) => setSupplierId(event.target.value)}
          >
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
        <label className="space-y-1 text-sm md:col-span-2">
          <span>Notes</span>
          <textarea className={fieldClass} name="notes" rows={2} />
        </label>
      </div>

      <div className="space-y-3">
        <h2 className="text-lg font-semibold">Lines</h2>
        {supplierId ? (
          <p className="text-xs text-muted">
            Showing products tagged to this supplier, plus any product with no supplier tagged yet.
          </p>
        ) : null}

        <AddOrderLine products={pickableProducts} onAdd={(line) => setLines((current) => [...current, line])} />

        {lines.length > 0 ? (
          <BulkLineActionsBar
            onApplyAvgCost={applyAvgCostToAll}
            onApplyDiscount={applyBulkDiscount}
            onSetQuantity={applyBulkQuantity}
            onSetUnitPrice={applyBulkUnitPrice}
          />
        ) : null}

        <OrderLinesTable
          lines={lines}
          products={products}
          gstRegistered={gstRegistered}
          gstRate={gstRate}
          onChange={updateLine}
          onRemove={removeLine}
          onMove={moveLine}
        />

        <OrderTotals lines={lines} gstRegistered={gstRegistered} gstRate={gstRate} />
      </div>

      <button className={btnClass} disabled={pending || lines.length === 0} type="submit">
        {pending ? "Saving…" : "Save draft order"}
      </button>
    </form>
  );
}
