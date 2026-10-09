"use client";

import Link from "next/link";
import { useRouter, unstable_rethrow } from "next/navigation";
import { useRef, useState } from "react";
import { removeGoodsReceipt, updateGoodsReceiptInvoice, updatePurchaseOrder, updatePurchaseOrderDate } from "../actions";
import { formatDate, formatDateTime, formatMoney, formatQty } from "@/lib/format";
import { classificationLabel, type PoStatus } from "@/lib/labels";
import { blurOnWheel, btnClass, btnDangerClass, btnSecondaryClass, fieldClass, numberFieldClass, tableClass, tdClass, thClass } from "@/lib/ui";
import { AddOrderLine, OrderLinesTable, type EditableLine } from "../order-line-row";
import { BulkLineActionsBar } from "../bulk-line-actions";
import { PoStatusBadge } from "../po-status-badge";
import { OrderTotals } from "../order-totals";
import { catalogTax } from "@/lib/catalog-pricing";
import { cn } from "@/lib/utils";
import { VoidOrderButton } from "./void-order-button";
import { DeleteDraftOrderButton } from "./delete-draft-order-button";
import { DuplicateOrderButton } from "./duplicate-order-button";
import { AddFreeGoodsModal } from "./add-free-goods-modal";
import { getFreeGoodsProductOptionsAction } from "./free-goods-actions";
import type { Option, ProductOption } from "@/components/product-picker";

type SupplierOption = Option & { gstRegistered: boolean };

type AuditEvent = {
  id: string;
  eventType: string;
  actorName: string;
  remarks: string | null;
  createdAt: string;
};


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

type ReceiptFreeItem = {
  productId: string;
  label: string;
  classification: EditableLine["classification"] | null;
  quantity: number;
};

type ReceiptSummary = {
  id: string;
  receivedDate: string;
  receivedBy: string | null;
  notes: string | null;
  invoiceReference: string | null;
  invoiceAttachmentUrl: string | null;
  roundingAdjustment: number;
  fxAdjustment: number;
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

function auditEventLabel(eventType: string) {
  if (eventType === "receipt_date_changed") return "Receipt date changed";
  if (eventType === "order_date_changed") return "Order date changed";
  return eventType.replaceAll("_", " ");
}

/** Order date on a sent/received order: reference only, so it stays editable. */
function OrderDateEditor({ purchaseOrderId, orderDate }: { purchaseOrderId: string; orderDate: string }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(orderDate);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setPending(true);
    setError(null);
    try {
      await updatePurchaseOrderDate(purchaseOrderId, value);
      setEditing(false);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not change the order date.");
    } finally {
      setPending(false);
    }
  }

  if (!editing) {
    return (
      <dd className="flex items-center gap-2">
        {formatDate(orderDate)}
        <button
          type="button"
          className="text-muted underline"
          onClick={() => {
            setValue(orderDate);
            setError(null);
            setEditing(true);
          }}
        >
          Edit
        </button>
      </dd>
    );
  }

  return (
    <dd className="space-y-1">
      <input
        className={fieldClass}
        type="date"
        value={value}
        onChange={(event) => setValue(event.target.value)}
        disabled={pending}
      />
      <div className="flex gap-3">
        <button type="button" className="text-muted underline" onClick={() => setEditing(false)} disabled={pending}>
          Cancel
        </button>
        <button type="button" className="text-blue-600 underline" onClick={() => void save()} disabled={pending || !value}>
          {pending ? "Saving…" : "Save"}
        </button>
      </div>
      <p className="text-xs text-muted">For reference only — stock and costs use each receipt&apos;s received date.</p>
      {error ? <p className="text-red-700">{error}</p> : null}
    </dd>
  );
}

function ReceiptInvoiceRow({ receipt }: { receipt: ReceiptSummary }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [reference, setReference] = useState(receipt.invoiceReference ?? "");
  const [receivedDate, setReceivedDate] = useState(receipt.receivedDate);
  const [roundingAdjustmentText, setRoundingAdjustmentText] = useState(String(receipt.roundingAdjustment));
  const roundingAdjustment = Number(roundingAdjustmentText) || 0;
  const [fxAdjustmentText, setFxAdjustmentText] = useState(String(receipt.fxAdjustment));
  const fxAdjustment = Number(fxAdjustmentText) || 0;
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /** Opens the editor from the receipt as saved now (it may have changed elsewhere, e.g. its rounding). */
  function startEditing() {
    setReference(receipt.invoiceReference ?? "");
    setReceivedDate(receipt.receivedDate);
    setRoundingAdjustmentText(String(receipt.roundingAdjustment));
    setFxAdjustmentText(String(receipt.fxAdjustment));
    setError(null);
    setEditing(true);
  }

  async function save(formData: FormData) {
    if (pending) return;
    setPending(true);
    setError(null);
    try {
      const file = formData.get("invoice_attachment");
      const result = await updateGoodsReceiptInvoice(
        receipt.id,
        reference,
        receivedDate,
        roundingAdjustment,
        fxAdjustment,
        file instanceof File && file.size > 0 ? file : null,
      );
      if (!result.ok) {
        setError(result.error);
        return;
      }
      if (result.warning) window.alert(result.warning);
      setEditing(false);
      router.refresh();
    } catch {
      setError("Could not reach the server. Check your connection and try again.");
    } finally {
      setPending(false);
    }
  }

  async function remove() {
    if (pending) return;
    const ok = window.confirm(
      "Remove this receipt? This reverses its stock and cost impact, as long as none of it has been used/sold and nothing newer has been received for the same products — otherwise it'll be blocked and tell you why.",
    );
    if (!ok) return;
    setPending(true);
    setError(null);
    try {
      const result = await removeGoodsReceipt(receipt.id);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      router.refresh();
    } catch {
      setError("Could not reach the server. Check your connection, then reload to see whether the receipt was removed.");
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
          <div className="flex gap-2">
            <button className={btnSecondaryClass} type="button" onClick={startEditing}>
              {receipt.invoiceReference || receipt.invoiceAttachmentUrl ? "Edit receipt" : "Add invoice"}
            </button>
            <button className={btnDangerClass} type="button" onClick={() => void remove()} disabled={pending}>
              Remove
            </button>
          </div>
        ) : null}
      </div>

      {error ? <p className="mt-2 text-red-700">{error}</p> : null}

      {editing ? (
        <form
          // A plain submit, so a failed save doesn't clear the chosen invoice file.
          onSubmit={(event) => {
            event.preventDefault();
            void save(new FormData(event.currentTarget));
          }}
          className="mt-3 grid gap-3 sm:grid-cols-2"
        >
          <label className="space-y-1">
            <span>Received date</span>
            <input
              className={fieldClass}
              type="date"
              value={receivedDate}
              onChange={(event) => setReceivedDate(event.target.value)}
              required
            />
          </label>
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
          <label className="space-y-1">
            <span>Rounding / adjustment</span>
            <input
              className={cn(fieldClass, numberFieldClass)}
              type="number"
              step="0.01"
              value={roundingAdjustmentText}
              onWheel={blurOnWheel}
              onChange={(event) => setRoundingAdjustmentText(event.target.value)}
              placeholder="0.00"
            />
          </label>
          <label className="space-y-1">
            <span>FX clearing</span>
            <input
              className={cn(fieldClass, numberFieldClass)}
              type="number"
              step="0.01"
              value={fxAdjustmentText}
              onWheel={blurOnWheel}
              onChange={(event) => setFxAdjustmentText(event.target.value)}
              placeholder="0.00"
            />
          </label>
          <div className="flex gap-2 sm:col-span-2">
            <button
              className={btnSecondaryClass}
              type="button"
              onClick={() => {
                setEditing(false);
                setReference(receipt.invoiceReference ?? "");
                setReceivedDate(receipt.receivedDate);
                setRoundingAdjustmentText(String(receipt.roundingAdjustment));
                setFxAdjustmentText(String(receipt.fxAdjustment));
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
          {receipt.roundingAdjustment !== 0 ? (
            <p>Rounding / adjustment: {formatMoney(receipt.roundingAdjustment)}</p>
          ) : null}
          {receipt.fxAdjustment !== 0 ? <p>FX clearing: {formatMoney(receipt.fxAdjustment)}</p> : null}
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
  gstRegistered,
  gstRate,
  orderDate,
  expectedDeliveryDate,
  notes,
  suppliers,
  canReceiveNow,
  canVoidNow,
  canAddFreeGoodsNow,
  items,
  products,
  receipts,
  plannedFxAdjustment,
  freeGoodsSummary,
  auditEvents,
}: {
  poNumber: string;
  purchaseOrderId: string;
  status: PoStatus;
  branchName: string;
  supplierId: string;
  supplierName: string;
  gstRegistered: boolean;
  gstRate: number;
  orderDate: string;
  expectedDeliveryDate: string | null;
  notes: string | null;
  suppliers: SupplierOption[];
  canReceiveNow: boolean;
  canVoidNow: boolean;
  canAddFreeGoodsNow: boolean;
  items: DisplayItem[];
  products: ProductOption[];
  receipts: ReceiptSummary[];
  /** FX clearing amount entered on the draft — carried onto the receipt when it's received. */
  plannedFxAdjustment: number;
  freeGoodsSummary: ReceiptFreeItem[];
  auditEvents: AuditEvent[];
}) {
  const router = useRouter();
  const editableOrder = status === "draft";
  const [editing, setEditing] = useState(false);
  const [showAddFreeGoods, setShowAddFreeGoods] = useState(false);
  // The free-goods picker's catalog, fetched the first time it's needed and
  // kept for re-opens (it survives router.refresh(), which keeps this state).
  const [freeGoodsProducts, setFreeGoodsProducts] = useState<ProductOption[] | null>(null);
  const [freeGoodsProductsError, setFreeGoodsProductsError] = useState<string | null>(null);
  const freeGoodsRequest = useRef<Promise<void> | null>(null);
  const [editSupplierId, setEditSupplierId] = useState(supplierId);
  const [editOrderDate, setEditOrderDate] = useState(orderDate);
  const [lines, setLines] = useState<EditableLine[]>(() => itemsToLines(items));
  const [editFxText, setEditFxText] = useState(plannedFxAdjustment ? String(plannedFxAdjustment) : "");
  const editFx = Number(editFxText) || 0;
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const editGstRegistered = suppliers.find((supplier) => supplier.id === editSupplierId)?.gstRegistered ?? gstRegistered;
  const editPickableProducts = editSupplierId
    ? products.filter((product) => !product.supplierIds?.length || product.supplierIds.includes(editSupplierId))
    : products;
  const sentEvents = auditEvents.filter((event) => event.eventType === "sent");
  const latestSentEvent = sentEvents.length > 0 ? sentEvents[sentEvents.length - 1] : null;
  const otherEvents = auditEvents.filter((event) => event.eventType !== "sent");

  const receivedItems = items.filter((item) => item.quantity_received > 0);
  const receivedTotalQty =
    receivedItems.reduce((sum, item) => sum + item.quantity_received, 0) +
    freeGoodsSummary.reduce((sum, row) => sum + row.quantity, 0);
  const receivedUniqueSkuCount = receivedItems.length + freeGoodsSummary.length;
  const totalRoundingAdjustment = receipts.reduce((sum, receipt) => sum + receipt.roundingAdjustment, 0);
  // Until it's received, an order's FX is the planned amount on the draft;
  // after that, it's whatever was recorded on its receipts.
  const totalFxAdjustment =
    receipts.length > 0 ? receipts.reduce((sum, receipt) => sum + receipt.fxAdjustment, 0) : plannedFxAdjustment;
  const onlyReceipt = receipts.length === 1 ? receipts[0] : null;

  async function saveRoundingAdjustment(value: number) {
    if (!onlyReceipt) return;
    const result = await updateGoodsReceiptInvoice(
      onlyReceipt.id,
      onlyReceipt.invoiceReference ?? "",
      onlyReceipt.receivedDate,
      value,
      onlyReceipt.fxAdjustment,
    );
    if (!result.ok) throw new Error(result.error);
    router.refresh();
  }

  function loadFreeGoodsProducts() {
    // Already loaded, or a request (e.g. from hovering the button) is in flight.
    if (freeGoodsProducts || freeGoodsRequest.current) return;
    setFreeGoodsProductsError(null);
    freeGoodsRequest.current = getFreeGoodsProductOptionsAction()
      .then((options) => setFreeGoodsProducts(options))
      .catch((err: unknown) => {
        unstable_rethrow(err);
        setFreeGoodsProductsError(err instanceof Error ? err.message : "Could not load products.");
      })
      .finally(() => {
        freeGoodsRequest.current = null;
      });
  }

  function openAddFreeGoods() {
    loadFreeGoodsProducts();
    setShowAddFreeGoods(true);
  }

  function startEditing() {
    setEditSupplierId(supplierId);
    setEditOrderDate(orderDate);
    setLines(itemsToLines(items));
    setEditFxText(plannedFxAdjustment ? String(plannedFxAdjustment) : "");
    setError(null);
    setEditing(true);
  }

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

  async function save() {
    if (pending) return;
    setPending(true);
    setError(null);
    try {
      const result = await updatePurchaseOrder({
        purchase_order_id: purchaseOrderId,
        supplier_id: editSupplierId,
        order_date: editOrderDate,
        fx_adjustment: editFx,
        lines: lines.map((line) => ({
          product_id: line.product_id,
          classification: line.classification,
          quantity_ordered: line.quantity_ordered,
          unit_price: line.unit_price,
        })),
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setEditing(false);
      router.refresh();
    } catch {
      setError("Could not reach the server. Check your connection and try again.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <Link href="/stock-in" className="text-sm text-muted underline">
          Back to stock-in
        </Link>
        <div className="mt-2 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">{poNumber}</h1>
            <p className="mt-1 flex items-center gap-1 text-sm text-muted">
              {supplierName} · {branchName} · <PoStatusBadge status={status} />
            </p>
          </div>
          <div className="flex gap-2">
            {editing ? (
              <>
                <button className={btnSecondaryClass} type="button" onClick={() => setEditing(false)} disabled={pending}>
                  Cancel
                </button>
                <button className={btnClass} type="button" onClick={() => void save()} disabled={pending || lines.length === 0}>
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
                {canReceiveNow ? (
                  <Link className={btnClass} href={`/stock-in/${purchaseOrderId}/receive`}>
                    Confirm &amp; receive
                  </Link>
                ) : null}
                {canAddFreeGoodsNow ? (
                  <button
                    className={btnSecondaryClass}
                    type="button"
                    onClick={openAddFreeGoods}
                    // Start fetching the catalog on intent so it's usually ready by the click.
                    onPointerEnter={loadFreeGoodsProducts}
                    onFocus={loadFreeGoodsProducts}
                  >
                    Add free goods
                  </button>
                ) : null}
                <DuplicateOrderButton purchaseOrderId={purchaseOrderId} />
                {canVoidNow ? <VoidOrderButton purchaseOrderId={purchaseOrderId} /> : null}
                {editableOrder ? <DeleteDraftOrderButton purchaseOrderId={purchaseOrderId} poNumber={poNumber} /> : null}
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
          ) : editableOrder || status === "cancelled" ? (
            <dd>{formatDate(orderDate)}</dd>
          ) : (
            <OrderDateEditor purchaseOrderId={purchaseOrderId} orderDate={orderDate} />
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
          <AddOrderLine products={editPickableProducts} onAdd={(line) => setLines((current) => [...current, line])} />
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
            gstRegistered={editGstRegistered}
            gstRate={gstRate}
            onChange={updateLine}
            onRemove={removeLine}
            onMove={moveLine}
          />
          <OrderTotals
            lines={lines}
            gstRegistered={editGstRegistered}
            gstRate={gstRate}
            fxInput={{ value: editFxText, onChange: setEditFxText }}
          />
          <p className="ml-auto max-w-xs text-right text-xs text-muted">
            FX clearing: the amount that makes the total match the PDF invoice (+ loss, − gain). Carried onto the
            receipt when you receive — you can still change it there.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="overflow-x-auto rounded-xl border border-border bg-card">
            <table className={tableClass}>
              <thead>
                <tr>
                  <th className={thClass}>Product</th>
                  <th className={thClass}>Type</th>
                  <th className={thClass}>Ordered</th>
                  <th className={thClass}>Received</th>
                  <th className={thClass}>Unit price</th>
                  <th className={thClass}>Price incl. GST</th>
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
                    <td className={tdClass}>
                      {formatMoney(catalogTax(item.unit_price, gstRegistered, gstRate).unitCostWithTax)}
                    </td>
                    <td className={tdClass}>{formatMoney(item.line_total)}</td>
                  </tr>
                ))}
                {freeGoodsSummary.map((row) => (
                  <tr key={row.productId}>
                    <td className={tdClass}>{row.label}</td>
                    <td className={tdClass}>
                      {classificationLabel(row.classification)}
                      <span className="ml-1 text-xs text-muted">(free)</span>
                    </td>
                    <td className={tdClass}>—</td>
                    <td className={tdClass}>{formatQty(row.quantity)}</td>
                    <td className={tdClass}>{formatMoney(0)}</td>
                    <td className={tdClass}>{formatMoney(0)}</td>
                    <td className={tdClass}>{formatMoney(0)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <OrderTotals
            lines={items}
            gstRegistered={gstRegistered}
            gstRate={gstRate}
            adjustment={totalRoundingAdjustment}
            fxAdjustment={totalFxAdjustment}
            totalQuantity={status === "received" ? receivedTotalQty : undefined}
            uniqueSkuCount={status === "received" ? receivedUniqueSkuCount : undefined}
            onAdjustmentSave={onlyReceipt ? saveRoundingAdjustment : undefined}
          />
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

      {status !== "draft" && (latestSentEvent || otherEvents.length > 0) ? (
        <div className="space-y-3">
          <h2 className="text-lg font-semibold">Audit trail</h2>
          {latestSentEvent ? (
            <dl className="grid gap-3 rounded-xl border border-border bg-card p-4 text-sm sm:grid-cols-3">
              <div>
                <dt className="text-muted">Marked sent by</dt>
                <dd>{latestSentEvent.actorName}</dd>
              </div>
              <div>
                <dt className="text-muted">Date</dt>
                <dd>{formatDateTime(latestSentEvent.createdAt)}</dd>
              </div>
              <div>
                <dt className="text-muted">Remarks</dt>
                <dd>{latestSentEvent.remarks || "—"}</dd>
              </div>
            </dl>
          ) : null}
          {otherEvents.length > 0 ? (
            <div className="overflow-x-auto rounded-xl border border-border bg-card">
              <table className={tableClass}>
                <thead>
                  <tr>
                    <th className={thClass}>Event</th>
                    <th className={thClass}>By</th>
                    <th className={thClass}>Date</th>
                    <th className={thClass}>Remarks</th>
                  </tr>
                </thead>
                <tbody>
                  {otherEvents.map((event) => (
                    <tr key={event.id}>
                      <td className={cn(tdClass, "capitalize")}>{auditEventLabel(event.eventType)}</td>
                      <td className={tdClass}>{event.actorName}</td>
                      <td className={tdClass}>{formatDateTime(event.createdAt)}</td>
                      <td className={tdClass}>{event.remarks || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
        </div>
      ) : null}

      {showAddFreeGoods ? (
        <AddFreeGoodsModal
          purchaseOrderId={purchaseOrderId}
          products={freeGoodsProducts}
          productsError={freeGoodsProductsError}
          onRetryProducts={loadFreeGoodsProducts}
          onClose={() => setShowAddFreeGoods(false)}
          onSaved={() => {
            setShowAddFreeGoods(false);
            router.refresh();
          }}
        />
      ) : null}
    </div>
  );
}
