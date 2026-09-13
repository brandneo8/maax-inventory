"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { markPurchaseOrderSent, updateGoodsReceiptInvoice, updatePurchaseOrder } from "../actions";
import { formatDate, formatMoney, formatQty } from "@/lib/format";
import { classificationLabel, poStatusLabel, type PoStatus } from "@/lib/labels";
import { btnClass, btnSecondaryClass, fieldClass, tableClass, tdClass, thClass } from "@/lib/ui";
import { emptyLine, OrderLineRow, type EditableLine } from "../order-line-row";
import type { Option, ProductOption } from "@/components/product-picker";

type DisplayItem = {
  id: string;
  product_id: string;
  label: string;
  classification: EditableLine["classification"];
  quantity_ordered: number;
  quantity_received: number;
  unit_price: number;
  line_total: number;
};

type ReceiptSummary = {
  id: string;
  receivedDate: string;
  receivedBy: string | null;
  notes: string | null;
  invoiceReference: string | null;
  invoiceAttachmentUrl: string | null;
};

function itemsToLines(items: DisplayItem[]): EditableLine[] {
  return items.map((item) => ({
    key: item.id,
    product_id: item.product_id,
    classification: item.classification,
    quantity_ordered: item.quantity_ordered,
    unit_price: item.unit_price,
  }));
}

function ReceiptInvoiceRow({ receipt }: { receipt: ReceiptSummary }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [reference, setReference] = useState(receipt.invoiceReference ?? "");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save(formData: FormData) {
    setPending(true);
    setError(null);
    try {
      const file = formData.get("invoice_attachment");
      await updateGoodsReceiptInvoice(
        receipt.id,
        reference,
        file instanceof File && file.size > 0 ? file : null,
      );
      setEditing(false);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save the invoice.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="rounded-xl border border-border bg-card p-4 text-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="font-medium">Received {formatDate(receipt.receivedDate)}</p>
          {receipt.receivedBy ? <p className="text-muted">By {receipt.receivedBy}</p> : null}
          {receipt.notes ? <p className="text-muted">{receipt.notes}</p> : null}
        </div>
        {!editing ? (
          <button className={btnSecondaryClass} type="button" onClick={() => setEditing(true)}>
            {receipt.invoiceReference || receipt.invoiceAttachmentUrl ? "Edit invoice" : "Add invoice"}
          </button>
        ) : null}
      </div>

      {error ? <p className="mt-2 text-red-700">{error}</p> : null}

      {editing ? (
        <form
          action={(formData) => void save(formData)}
          className="mt-3 grid gap-3 sm:grid-cols-2"
        >
          <label className="space-y-1">
            <span>Invoice reference</span>
            <input
              className={fieldClass}
              value={reference}
              onChange={(event) => setReference(event.target.value)}
              placeholder="Invoice number"
            />
          </label>
          <label className="space-y-1">
            <span>Invoice attachment</span>
            <input
              className={fieldClass}
              type="file"
              name="invoice_attachment"
              accept="application/pdf,image/png,image/jpeg,image/webp"
            />
          </label>
          <div className="flex gap-2 sm:col-span-2">
            <button
              className={btnSecondaryClass}
              type="button"
              onClick={() => {
                setEditing(false);
                setReference(receipt.invoiceReference ?? "");
                setError(null);
              }}
              disabled={pending}
            >
              Cancel
            </button>
            <button className={btnClass} type="submit" disabled={pending}>
              {pending ? "Saving…" : "Save"}
            </button>
          </div>
        </form>
      ) : (
        <div className="mt-2 space-y-1">
          <p>Invoice reference: {receipt.invoiceReference || "—"}</p>
          <p>
            Attachment:{" "}
            {receipt.invoiceAttachmentUrl ? (
              <a className="text-blue-600 underline" href={receipt.invoiceAttachmentUrl} target="_blank" rel="noreferrer">
                View file
              </a>
            ) : (
              "—"
            )}
          </p>
        </div>
      )}
    </div>
  );
}

export function OrderDetailPanel({
  poNumber,
  purchaseOrderId,
  status,
  branchName,
  supplierId,
  supplierName,
  orderDate,
  expectedDeliveryDate,
  notes,
  suppliers,
  canMarkSentNow,
  canReceiveNow,
  items,
  products,
  receipts,
}: {
  poNumber: string;
  purchaseOrderId: string;
  status: PoStatus;
  branchName: string;
  supplierId: string;
  supplierName: string;
  orderDate: string;
  expectedDeliveryDate: string | null;
  notes: string | null;
  suppliers: Option[];
  canMarkSentNow: boolean;
  canReceiveNow: boolean;
  items: DisplayItem[];
  products: ProductOption[];
  receipts: ReceiptSummary[];
}) {
  const router = useRouter();
  const editableOrder = status === "draft";
  const [editing, setEditing] = useState(false);
  const [editSupplierId, setEditSupplierId] = useState(supplierId);
  const [editOrderDate, setEditOrderDate] = useState(orderDate);
  const [lines, setLines] = useState<EditableLine[]>(() => itemsToLines(items));
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  function startEditing() {
    setEditSupplierId(supplierId);
    setEditOrderDate(orderDate);
    setLines(itemsToLines(items));
    setError(null);
    setEditing(true);
  }

  function updateLine(key: string, patch: Partial<EditableLine>) {
    setLines((current) => current.map((line) => (line.key === key ? { ...line, ...patch } : line)));
  }

  async function save() {
    setPending(true);
    setError(null);
    try {
      await updatePurchaseOrder({
        purchase_order_id: purchaseOrderId,
        supplier_id: editSupplierId,
        order_date: editOrderDate,
        lines: lines.map((line) => ({
          product_id: line.product_id,
          classification: line.classification,
          quantity_ordered: line.quantity_ordered,
          unit_price: line.unit_price,
        })),
      });
      setEditing(false);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save changes.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <Link href="/orders" className="text-sm text-muted underline">
          Back to orders
        </Link>
        <div className="mt-2 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">{poNumber}</h1>
            <p className="mt-1 text-sm text-muted">
              {supplierName} · {branchName} · {poStatusLabel(status)}
            </p>
          </div>
          <div className="flex gap-2">
            {editing ? (
              <>
                <button className={btnSecondaryClass} type="button" onClick={() => setEditing(false)} disabled={pending}>
                  Cancel
                </button>
                <button className={btnClass} type="button" onClick={() => void save()} disabled={pending}>
                  {pending ? "Saving…" : "Save changes"}
                </button>
              </>
            ) : (
              <>
                {editableOrder ? (
                  <button className={btnSecondaryClass} type="button" onClick={startEditing}>
                    Edit order
                  </button>
                ) : null}
                {canMarkSentNow ? (
                  <form action={markPurchaseOrderSent}>
                    <input type="hidden" name="id" value={purchaseOrderId} />
                    <button className={btnClass} type="submit">
                      Mark sent
                    </button>
                  </form>
                ) : null}
                {canReceiveNow ? (
                  <Link className={btnSecondaryClass} href={`/orders/${purchaseOrderId}/receive`}>
                    Receive stock
                  </Link>
                ) : null}
              </>
            )}
          </div>
        </div>
      </div>

      {error ? (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p>
      ) : null}

      <dl className="grid gap-3 rounded-xl border border-border bg-card p-4 text-sm sm:grid-cols-4">
        <div>
          <dt className="text-muted">Supplier</dt>
          {editing ? (
            <select
              className={fieldClass}
              value={editSupplierId}
              onChange={(event) => setEditSupplierId(event.target.value)}
            >
              {suppliers.map((supplier) => (
                <option key={supplier.id} value={supplier.id}>
                  {supplier.label}
                </option>
              ))}
            </select>
          ) : (
            <dd>{supplierName || "—"}</dd>
          )}
        </div>
        <div>
          <dt className="text-muted">Order date</dt>
          {editing ? (
            <input
              className={fieldClass}
              type="date"
              value={editOrderDate}
              onChange={(event) => setEditOrderDate(event.target.value)}
            />
          ) : (
            <dd>{formatDate(orderDate)}</dd>
          )}
        </div>
        <div>
          <dt className="text-muted">Expected delivery</dt>
          <dd>{formatDate(expectedDeliveryDate)}</dd>
        </div>
        <div>
          <dt className="text-muted">Notes</dt>
          <dd>{notes || "—"}</dd>
        </div>
      </dl>

      {editing ? (
        <div className="space-y-3">
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
          <button
            className={btnSecondaryClass}
            type="button"
            onClick={() => setLines((current) => [...current, emptyLine()])}
          >
            Add line
          </button>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border bg-card">
          <table className={tableClass}>
            <thead>
              <tr>
                <th className={thClass}>Product</th>
                <th className={thClass}>Type</th>
                <th className={thClass}>Ordered</th>
                <th className={thClass}>Received</th>
                <th className={thClass}>Unit price</th>
                <th className={thClass}>Line total</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id}>
                  <td className={tdClass}>{item.label}</td>
                  <td className={tdClass}>{classificationLabel(item.classification)}</td>
                  <td className={tdClass}>{formatQty(item.quantity_ordered)}</td>
                  <td className={tdClass}>{formatQty(item.quantity_received)}</td>
                  <td className={tdClass}>{formatMoney(item.unit_price)}</td>
                  <td className={tdClass}>{formatMoney(item.line_total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {receipts.length > 0 ? (
        <div className="space-y-3">
          <h2 className="text-lg font-semibold">Receipts</h2>
          <div className="space-y-3">
            {receipts.map((receipt) => (
              <ReceiptInvoiceRow key={receipt.id} receipt={receipt} />
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
