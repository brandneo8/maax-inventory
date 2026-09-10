"use client";

import { useMemo, useState } from "react";
import { receivePurchaseOrder } from "../../actions";
import { btnClass, fieldClass } from "@/lib/ui";

type Line = {
  purchase_order_item_id: string;
  product_id: string;
  label: string;
  remaining: number;
  unit_cost: number;
  store_location_id: string;
  quantity_received: number;
  contents: { label: string; quantity: number }[];
};

export function ReceiveForm({
  purchaseOrderId,
  defaultLocationId,
  lines: initialLines,
}: {
  purchaseOrderId: string;
  defaultLocationId: string;
  lines: Omit<Line, "store_location_id" | "quantity_received">[];
}) {
  const today = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const [lines, setLines] = useState<Line[]>(
    initialLines.map((line) => ({
      ...line,
      store_location_id: defaultLocationId,
      quantity_received: line.remaining > 0 ? line.remaining : 0,
    })),
  );
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(formData: FormData) {
    setPending(true);
    setError(null);
    try {
      await receivePurchaseOrder({
        purchase_order_id: purchaseOrderId,
        received_date: String(formData.get("received_date") ?? ""),
        notes: String(formData.get("notes") ?? ""),
        lines: lines.map((line) => ({
          purchase_order_item_id: line.purchase_order_item_id,
          product_id: line.product_id,
          store_location_id: defaultLocationId,
          quantity_received: line.quantity_received,
          unit_cost: line.unit_cost,
        })),
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not receive this order.");
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
          <span>Received date</span>
          <input className={fieldClass} type="date" name="received_date" defaultValue={today} />
        </label>
        <label className="space-y-1 text-sm">
          <span>Notes</span>
          <input className={fieldClass} name="notes" />
        </label>
      </div>

      <div className="space-y-3">
        {lines.map((line, index) => (
          <div key={line.purchase_order_item_id} className="grid gap-3 rounded-xl border border-border bg-card p-4 md:grid-cols-2">
            <div className="md:col-span-2 text-sm">
              <p className="font-medium">{line.label}</p>
              <p className="text-muted">Outstanding {line.remaining}. Over-receiving is allowed and recorded.</p>
              {line.contents.length > 0 ? (
                <p className="mt-1 text-muted">
                  Receiving {line.quantity_received || 0} will add{" "}
                  {line.contents
                    .map((item) => `${(line.quantity_received || 0) * item.quantity}× ${item.label}`)
                    .join(", ")}
                  .
                </p>
              ) : null}
            </div>
            <label className="space-y-1 text-sm">
              <span>Qty received</span>
              <input
                className={fieldClass}
                type="number"
                min="0"
                step="0.01"
                value={line.quantity_received}
                onChange={(event) => {
                  const value = Number(event.target.value);
                  setLines((current) =>
                    current.map((item, itemIndex) =>
                      itemIndex === index ? { ...item, quantity_received: value } : item,
                    ),
                  );
                }}
              />
            </label>
            <label className="space-y-1 text-sm">
              <span>Unit cost</span>
              <input
                className={fieldClass}
                type="number"
                min="0"
                step="0.01"
                value={line.unit_cost}
                onChange={(event) => {
                  const value = Number(event.target.value);
                  setLines((current) =>
                    current.map((item, itemIndex) =>
                      itemIndex === index ? { ...item, unit_cost: value } : item,
                    ),
                  );
                }}
              />
            </label>
          </div>
        ))}
      </div>

      <button className={btnClass} disabled={pending} type="submit">
        {pending ? "Receiving…" : "Receive into stock"}
      </button>
    </form>
  );
}
