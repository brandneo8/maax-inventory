"use client";

import { useMemo, useState } from "react";
import { createInvoiceFromReceipt } from "../actions";
import { btnClass, fieldClass } from "@/lib/ui";

type ReceiptOption = {
  id: string;
  label: string;
};

export function InvoiceForm({ receipts }: { receipts: ReceiptOption[] }) {
  const today = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(formData: FormData) {
    setPending(true);
    setError(null);
    try {
      await createInvoiceFromReceipt(formData);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create the invoice.");
      setPending(false);
    }
  }

  return (
    <form action={onSubmit} className="space-y-6">
      {error ? (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p>
      ) : null}

      <div className="grid gap-3 rounded-xl border border-border bg-card p-4 md:grid-cols-2">
        <label className="space-y-1 text-sm md:col-span-2">
          <span>Goods receipt</span>
          <select className={fieldClass} name="goods_receipt_id" required defaultValue="">
            <option value="" disabled>
              Select a receipt to sync
            </option>
            {receipts.map((receipt) => (
              <option key={receipt.id} value={receipt.id}>
                {receipt.label}
              </option>
            ))}
          </select>
        </label>
        <label className="space-y-1 text-sm">
          <span>Invoice number</span>
          <input className={fieldClass} name="invoice_number" required />
        </label>
        <label className="space-y-1 text-sm">
          <span>Invoice date</span>
          <input className={fieldClass} type="date" name="invoice_date" defaultValue={today} required />
        </label>
        <label className="space-y-1 text-sm">
          <span>Stated amount (ex tax)</span>
          <input className={fieldClass} type="number" min="0" step="0.01" name="total_amount" defaultValue="0" />
        </label>
        <label className="space-y-1 text-sm">
          <span>Stated tax</span>
          <input className={fieldClass} type="number" min="0" step="0.01" name="total_tax_amount" defaultValue="0" />
        </label>
        <label className="space-y-1 text-sm">
          <span>Stated gross total</span>
          <input className={fieldClass} type="number" min="0" step="0.01" name="total_gross_amount" defaultValue="0" />
        </label>
        <label className="space-y-1 text-sm">
          <span>Extra purchase discount</span>
          <input
            className={fieldClass}
            type="number"
            min="0"
            step="0.01"
            name="purchase_discount_amount"
            defaultValue="0"
          />
        </label>
      </div>

      <button className={btnClass} disabled={pending} type="submit">
        {pending ? "Creating…" : "Create invoice from receipt"}
      </button>
    </form>
  );
}
