"use client";

import { useMemo, useState } from "react";
import { Trash2 } from "lucide-react";
import { addFreeGoodsReceipt } from "../actions";
import { blurOnWheel, btnClass, btnSecondaryClass, fieldClass, numberFieldClass, tableClass, tdClass, thClass } from "@/lib/ui";
import { cn } from "@/lib/utils";
import { formatQty } from "@/lib/format";
import { classificationLabel, type ProductClassification } from "@/lib/labels";
import { ProductPicker, type ProductOption } from "@/components/product-picker";

type StagedLine = {
  key: string;
  product_id: string;
  label: string;
  classification: ProductClassification;
  quantity_received: number;
};

export function AddFreeGoodsModal({
  purchaseOrderId,
  products,
  onClose,
  onSaved,
}: {
  purchaseOrderId: string;
  products: ProductOption[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const today = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const [receivedDate, setReceivedDate] = useState(today);
  const [notes, setNotes] = useState("");
  const [productId, setProductId] = useState("");
  const [quantity, setQuantity] = useState(1);
  const [staged, setStaged] = useState<StagedLine[]>([]);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selected = products.find((product) => product.id === productId);
  const canAdd = Boolean(selected) && quantity > 0;

  function addLine() {
    if (!selected || !canAdd) return;
    setStaged((current) => [
      ...current,
      {
        key: crypto.randomUUID(),
        product_id: selected.id,
        label: selected.label,
        classification: selected.defaultClassification ?? "gwp",
        quantity_received: quantity,
      },
    ]);
    setProductId("");
    setQuantity(1);
  }

  function removeLine(key: string) {
    setStaged((current) => current.filter((line) => line.key !== key));
  }

  async function save() {
    if (staged.length === 0) {
      setError("Add at least one free product.");
      return;
    }
    setPending(true);
    setError(null);
    try {
      await addFreeGoodsReceipt({
        purchase_order_id: purchaseOrderId,
        received_date: receivedDate,
        notes,
        lines: staged.map((line) => ({
          product_id: line.product_id,
          quantity_received: line.quantity_received,
          classification: line.classification,
        })),
      });
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save the free goods.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-xl rounded-xl border border-border bg-white p-4 shadow-lg">
        <h2 className="text-lg font-semibold">Add free goods</h2>
        <p className="mt-1 text-sm text-muted">
          Record testers, GWP, or other no-charge items that arrived for this order. These don&apos;t count against
          the ordered quantities and are always recorded at $0.
        </p>

        {error ? (
          <p className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p>
        ) : null}

        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <label className="space-y-1 text-sm">
            <span className="text-muted">Received date</span>
            <input
              className={fieldClass}
              type="date"
              value={receivedDate}
              onChange={(event) => setReceivedDate(event.target.value)}
            />
          </label>
          <label className="space-y-1 text-sm">
            <span className="text-muted">Notes</span>
            <input className={fieldClass} value={notes} onChange={(event) => setNotes(event.target.value)} />
          </label>
        </div>

        <div className="mt-3 flex flex-wrap items-end gap-2 rounded-xl border border-border bg-card p-3">
          <label className="min-w-64 flex-1 space-y-1 text-sm">
            <span>Search product</span>
            <ProductPicker products={products} value={productId} onSelect={(product) => setProductId(product.id)} />
          </label>
          <label className="w-28 space-y-1 text-sm">
            <span>Quantity</span>
            <input
              className={cn(fieldClass, numberFieldClass)}
              type="number"
              min="0"
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
            />
          </label>
          <button className={btnClass} type="button" onClick={addLine} disabled={!canAdd}>
            Add
          </button>
        </div>

        {staged.length > 0 ? (
          <div className="mt-3 max-h-56 overflow-y-auto rounded-xl border border-border">
            <table className={tableClass}>
              <thead>
                <tr>
                  <th className={thClass}>Product</th>
                  <th className={thClass}>Type</th>
                  <th className={thClass}>Quantity</th>
                  <th className={thClass} />
                </tr>
              </thead>
              <tbody>
                {staged.map((line) => (
                  <tr key={line.key}>
                    <td className={tdClass}>{line.label}</td>
                    <td className={tdClass}>{classificationLabel(line.classification)}</td>
                    <td className={tdClass}>{formatQty(line.quantity_received)}</td>
                    <td className={tdClass}>
                      <button
                        type="button"
                        className="text-red-600 hover:text-red-800"
                        onClick={() => removeLine(line.key)}
                        aria-label={`Remove ${line.label}`}
                      >
                        <Trash2 className="size-4" aria-hidden />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}

        <div className="mt-4 flex justify-end gap-2">
          <button className={btnSecondaryClass} type="button" onClick={onClose} disabled={pending}>
            Cancel
          </button>
          <button className={btnClass} type="button" onClick={() => void save()} disabled={pending}>
            {pending ? "Saving…" : "Save free goods"}
          </button>
        </div>
      </div>
    </div>
  );
}
