"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import type { OrderBalanceProduct } from "@/lib/data/products";
import { formatDate, formatDateTime, formatMoney, formatQty, singaporeToday } from "@/lib/format";
import { btnClass, btnSecondaryClass, fieldClass, tableClass, tdClass, thClass } from "@/lib/ui";
import { InventoryBalancePane } from "./inventory-balance-pane";
import { deletePlanningOrder, markPlanningOrderSent, markPlanningOrderUnsent } from "./actions";

type SupplierOption = { id: string; label: string; gstRegistered: boolean };
type Tab = "balance" | "orders";

export type DraftOrderRow = {
  id: string;
  poNumber: string;
  supplierName: string;
  orderDate: string | null;
  sent: boolean;
  sentDate: string | null;
  sentBy: string | null;
  requestedBy: string | null;
  lineCount: number;
  subtotalAmount: number;
  totalAmount: number;
  lines: {
    id: string;
    productId: string;
    brand: string;
    label: string;
    sku: string | null;
    quantity: number;
    unitPrice: number;
  }[];
};

export function OrdersWorkspace({
  branchId,
  products,
  suppliers,
  gstRate,
  orders,
}: {
  branchId: string;
  products: OrderBalanceProduct[];
  suppliers: SupplierOption[];
  gstRate: number;
  orders: DraftOrderRow[];
}) {
  const [tab, setTab] = useState<Tab>("balance");
  const [savedPoNumbers, setSavedPoNumbers] = useState<string[]>([]);

  function onSaved(poNumbers: string[]) {
    setSavedPoNumbers(poNumbers);
    setTab("orders");
  }

  function tabButtonClass(active: boolean) {
    return cn(
      "border-b-2 px-3 py-2 text-sm font-medium",
      active ? "border-slate-900 text-slate-900" : "border-transparent text-muted hover:text-slate-700",
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex gap-2 border-b border-border">
        <button type="button" onClick={() => setTab("balance")} className={tabButtonClass(tab === "balance")}>
          Inventory balance
        </button>
        <button type="button" onClick={() => setTab("orders")} className={tabButtonClass(tab === "orders")}>
          Draft orders ({orders.filter((order) => !order.sent).length})
        </button>
      </div>

      {tab === "balance" ? (
        <InventoryBalancePane
          branchId={branchId}
          products={products}
          suppliers={suppliers}
          gstRate={gstRate}
          onSaved={onSaved}
        />
      ) : (
        <DraftOrdersTable orders={orders} savedPoNumbers={savedPoNumbers} products={products} />
      )}
    </div>
  );
}

/** Orders saved from the planning form, split into not-yet-sent and sent. Nothing here touches stock. */
function DraftOrdersTable({
  orders,
  savedPoNumbers,
  products,
}: {
  orders: DraftOrderRow[];
  savedPoNumbers: string[];
  products: OrderBalanceProduct[];
}) {
  const router = useRouter();
  const [openOrderId, setOpenOrderId] = useState<string | null>(null);
  const [sendingOrder, setSendingOrder] = useState<DraftOrderRow | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const openOrder = orders.find((order) => order.id === openOrderId) ?? null;
  // Latest first: unsent by the date saved for, sent by the date sent;
  // ties fall back to the newer draft number.
  const newestFirst = (key: "orderDate" | "sentDate") => (left: DraftOrderRow, right: DraftOrderRow) =>
    (right[key] ?? "").localeCompare(left[key] ?? "") ||
    right.poNumber.localeCompare(left.poNumber, undefined, { numeric: true });
  const unsent = orders.filter((order) => !order.sent).sort(newestFirst("orderDate"));
  const sent = orders.filter((order) => order.sent).sort(newestFirst("sentDate"));

  async function remove(order: DraftOrderRow) {
    if (!window.confirm(`Delete ${order.poNumber}? This can't be undone.`)) return;
    setBusyId(order.id);
    setError(null);
    try {
      await deletePlanningOrder(order.id);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not delete this order.");
    } finally {
      setBusyId(null);
    }
  }

  async function unsend(order: DraftOrderRow) {
    setBusyId(order.id);
    setError(null);
    try {
      await markPlanningOrderUnsent(order.id);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not mark this order unsent.");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="space-y-6">
      {savedPoNumbers.length > 0 ? (
        <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
          Saved {savedPoNumbers.join(", ")} as {savedPoNumbers.length === 1 ? "a draft order" : "draft orders, one per supplier"}.
        </p>
      ) : null}
      {error ? (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p>
      ) : null}

      <PlanningOrderList
        title="Not sent"
        emptyText="No unsent orders. Build one in Inventory balance and save it."
        orders={unsent}
        highlightPoNumbers={savedPoNumbers}
        busyId={busyId}
        onOpen={setOpenOrderId}
        actions={(order) => (
          <>
            <button
              type="button"
              className={cn(btnClass, "px-2 py-1 text-xs")}
              onClick={() => setSendingOrder(order)}
              disabled={busyId === order.id}
            >
              Mark sent
            </button>
            <button
              type="button"
              className="rounded-md p-1.5 text-red-600 hover:bg-red-50 hover:text-red-800 disabled:opacity-50"
              onClick={() => void remove(order)}
              disabled={busyId === order.id}
              aria-label={`Delete ${order.poNumber}`}
              title="Delete"
            >
              <Trash2 className="h-4 w-4" aria-hidden />
            </button>
          </>
        )}
      />

      <PlanningOrderList
        title="Sent"
        emptyText="No sent orders yet. Mark an order sent once it's gone to the supplier."
        orders={sent}
        showSent
        busyId={busyId}
        onOpen={setOpenOrderId}
        actions={(order) => (
          <>
            <button
              type="button"
              className={cn(btnSecondaryClass, "px-2 py-1 text-xs")}
              onClick={() => void unsend(order)}
              disabled={busyId === order.id}
            >
              Mark unsent
            </button>
            <button
              type="button"
              className="rounded-md p-1.5 text-red-600 hover:bg-red-50 hover:text-red-800 disabled:opacity-50"
              onClick={() => void remove(order)}
              disabled={busyId === order.id}
              aria-label={`Delete ${order.poNumber}`}
              title="Delete"
            >
              <Trash2 className="h-4 w-4" aria-hidden />
            </button>
          </>
        )}
      />

      {openOrder ? (
        <DraftOrderPopup order={openOrder} products={products} onClose={() => setOpenOrderId(null)} />
      ) : null}
      {sendingOrder ? (
        <MarkSentDialog
          order={sendingOrder}
          onClose={() => setSendingOrder(null)}
          onSent={() => {
            setSendingOrder(null);
            router.refresh();
          }}
        />
      ) : null}
    </div>
  );
}

const LIST_PAGE_SIZE = 10;

// Both tables share these widths (table-fixed), so their columns line up.
const LIST_COLUMNS = [
  { key: "order", label: "Order", width: "w-[10%]" },
  { key: "supplier", label: "Supplier", width: "w-[13%]" },
  { key: "requestedBy", label: "Requested by", width: "w-[10%]" },
  { key: "saved", label: "Saved for", width: "w-[9%]" },
  { key: "products", label: "Products", width: "w-[7%]", right: true },
  { key: "subtotal", label: "Total (w/o tax)", width: "w-[10%]", right: true },
  { key: "total", label: "Total (w/ tax)", width: "w-[10%]", right: true },
  { key: "sentOn", label: "Sent on", width: "w-[9%]", sentOnly: true },
  { key: "sentBy", label: "Sent by", width: "w-[9%]", sentOnly: true },
  { key: "actions", label: "", width: "w-[13%]" },
] as const;

function PlanningOrderList({
  title,
  emptyText,
  orders,
  showSent = false,
  highlightPoNumbers = [],
  busyId,
  onOpen,
  actions,
}: {
  title: string;
  emptyText: string;
  orders: DraftOrderRow[];
  showSent?: boolean;
  highlightPoNumbers?: string[];
  busyId: string | null;
  onOpen: (orderId: string) => void;
  actions: (order: DraftOrderRow) => React.ReactNode;
}) {
  const subtotal = orders.reduce((sum, order) => sum + order.subtotalAmount, 0);
  const total = orders.reduce((sum, order) => sum + order.totalAmount, 0);
  const [page, setPage] = useState(0);
  const pageCount = Math.max(1, Math.ceil(orders.length / LIST_PAGE_SIZE));
  // Stay on a real page when rows go (deleted, or moved to the other table).
  const currentPage = Math.min(page, pageCount - 1);
  const pageOrders = orders.slice(currentPage * LIST_PAGE_SIZE, (currentPage + 1) * LIST_PAGE_SIZE);

  return (
    <section className="space-y-2">
      <h2 className="text-base font-semibold">
        {title} <span className="font-normal text-muted">({orders.length})</span>
      </h2>
      <div className="overflow-x-auto rounded-xl border border-border bg-card">
        <table className={cn(tableClass, "min-w-[64rem] table-fixed")}>
          <colgroup>
            {LIST_COLUMNS.map((column) => (
              <col key={column.key} className={column.width} />
            ))}
          </colgroup>
          <thead>
            <tr>
              {LIST_COLUMNS.map((column) => (
                <th
                  key={column.key}
                  className={cn(thClass, "right" in column && column.right && "text-right")}
                >
                  {"sentOnly" in column && column.sentOnly && !showSent ? "" : column.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {orders.length === 0 ? (
              <tr>
                <td className={cn(tdClass, "text-muted")} colSpan={LIST_COLUMNS.length}>
                  {emptyText}
                </td>
              </tr>
            ) : (
              pageOrders.map((order) => (
                <tr
                  key={order.id}
                  className={cn(
                    "cursor-pointer hover:bg-slate-50",
                    highlightPoNumbers.includes(order.poNumber) && "bg-emerald-50/60",
                    busyId === order.id && "opacity-50",
                  )}
                  onClick={() => onOpen(order.id)}
                >
                  <td className={cn(tdClass, "truncate font-medium")}>
                    <button
                      type="button"
                      className="text-sky-700 underline"
                      onClick={(event) => {
                        event.stopPropagation();
                        onOpen(order.id);
                      }}
                    >
                      {order.poNumber}
                    </button>
                  </td>
                  <td className={cn(tdClass, "truncate")} title={order.supplierName}>
                    {order.supplierName || "—"}
                  </td>
                  <td className={cn(tdClass, "truncate")} title={order.requestedBy ?? undefined}>
                    {order.requestedBy || "—"}
                  </td>
                  <td className={cn(tdClass, "whitespace-nowrap")}>{formatDate(order.orderDate)}</td>
                  <td className={cn(tdClass, "text-right tabular-nums")}>{order.lineCount}</td>
                  <td className={cn(tdClass, "text-right tabular-nums")}>{formatMoney(order.subtotalAmount)}</td>
                  <td className={cn(tdClass, "text-right tabular-nums")}>{formatMoney(order.totalAmount)}</td>
                  <td className={cn(tdClass, "whitespace-nowrap")}>{showSent ? formatDate(order.sentDate) : ""}</td>
                  <td className={cn(tdClass, "truncate")} title={order.sentBy ?? undefined}>
                    {showSent ? order.sentBy || "—" : ""}
                  </td>
                  <td className={tdClass} onClick={(event) => event.stopPropagation()}>
                    <div className="flex flex-nowrap items-center justify-end gap-1.5 whitespace-nowrap">{actions(order)}</div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
          {orders.length > 0 ? (
            <tfoot>
              <tr className="font-semibold">
                <td className={tdClass} colSpan={5}>
                  Total{pageCount > 1 ? ` (all ${orders.length})` : ""}
                </td>
                <td className={cn(tdClass, "text-right tabular-nums")}>{formatMoney(subtotal)}</td>
                <td className={cn(tdClass, "text-right tabular-nums")}>{formatMoney(total)}</td>
                <td className={tdClass} colSpan={3} />
              </tr>
            </tfoot>
          ) : null}
        </table>
      </div>
      {pageCount > 1 ? (
        <div className="flex items-center justify-end gap-3 text-sm">
          <span className="text-muted">
            {currentPage * LIST_PAGE_SIZE + 1}–{Math.min((currentPage + 1) * LIST_PAGE_SIZE, orders.length)} of{" "}
            {orders.length}
          </span>
          <button
            type="button"
            className={cn(btnSecondaryClass, "px-3 py-1 text-xs")}
            onClick={() => setPage(currentPage - 1)}
            disabled={currentPage === 0}
          >
            Previous
          </button>
          <span className="tabular-nums">
            Page {currentPage + 1} of {pageCount}
          </span>
          <button
            type="button"
            className={cn(btnSecondaryClass, "px-3 py-1 text-xs")}
            onClick={() => setPage(currentPage + 1)}
            disabled={currentPage >= pageCount - 1}
          >
            Next
          </button>
        </div>
      ) : null}
    </section>
  );
}

/** Asks when the order went to the supplier and who sent it, then moves it to Sent. */
function MarkSentDialog({
  order,
  onClose,
  onSent,
}: {
  order: DraftOrderRow;
  onClose: () => void;
  onSent: () => void;
}) {
  const today = singaporeToday();
  const [sentDate, setSentDate] = useState(today);
  const [sentBy, setSentBy] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function confirm() {
    setPending(true);
    setError(null);
    try {
      await markPlanningOrderSent(order.id, sentDate, sentBy);
      onSent();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not mark this order sent.");
      setPending(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="mark-sent-title"
        className="w-full max-w-sm space-y-4 rounded-xl border border-border bg-white p-4 shadow-lg"
        onClick={(event) => event.stopPropagation()}
      >
        <div>
          <h2 id="mark-sent-title" className="text-lg font-semibold">
            Mark {order.poNumber} sent
          </h2>
          <p className="mt-1 text-sm text-muted">{order.supplierName || "No supplier"}</p>
        </div>
        <label className="block space-y-1 text-sm">
          <span>Date sent to the supplier</span>
          <input
            id="mark-sent-date"
            className={fieldClass}
            type="date"
            max={today}
            value={sentDate}
            onChange={(event) => setSentDate(event.target.value)}
            disabled={pending}
            autoFocus
          />
        </label>
        <label className="block space-y-1 text-sm">
          <span>Sent by</span>
          <input
            id="mark-sent-by"
            className={fieldClass}
            value={sentBy}
            onChange={(event) => setSentBy(event.target.value)}
            placeholder="Name of the person who sent it"
            disabled={pending}
          />
        </label>
        {error ? <p className="text-sm text-red-700">{error}</p> : null}
        <div className="flex justify-end gap-2">
          <button className={btnSecondaryClass} type="button" onClick={onClose} disabled={pending}>
            Cancel
          </button>
          <button
            className={btnClass}
            type="button"
            onClick={() => void confirm()}
            disabled={pending || !sentDate || !sentBy.trim()}
          >
            {pending ? "Saving…" : "Mark sent"}
          </button>
        </div>
      </div>
    </div>
  );
}

const NO_BRAND = "No brand";

/** One draft's lines, grouped by brand, with each product's monthly use to sense-check quantities. */
function DraftOrderPopup({
  order,
  products,
  onClose,
}: {
  order: DraftOrderRow;
  products: OrderBalanceProduct[];
  onClose: () => void;
}) {
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const router = useRouter();
  const [refreshing, startRefresh] = useTransition();
  // When the balances shown were loaded — reset by each refresh.
  const [checkedAt, setCheckedAt] = useState(() => new Date().toISOString());

  function refresh() {
    startRefresh(() => {
      router.refresh();
      setCheckedAt(new Date().toISOString());
    });
  }

  const productById = useMemo(() => new Map(products.map((product) => [product.id, product])), [products]);

  const groups = useMemo(() => {
    const byBrand = new Map<string, DraftOrderRow["lines"]>();
    for (const line of order.lines) {
      const brand = line.brand || NO_BRAND;
      byBrand.set(brand, [...(byBrand.get(brand) ?? []), line]);
    }
    return [...byBrand.entries()]
      .sort(([left], [right]) => {
        if (left === NO_BRAND) return 1;
        if (right === NO_BRAND) return -1;
        return left.localeCompare(right, undefined, { sensitivity: "base" });
      })
      .map(([brand, lines]) => ({
        brand,
        lines,
        total: lines.reduce((sum, line) => sum + line.quantity * line.unitPrice, 0),
      }));
  }, [order.lines]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="draft-order-title"
        className="flex max-h-[90vh] w-full max-w-4xl flex-col rounded-xl border border-border bg-white p-4 shadow-lg"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 id="draft-order-title" className="text-lg font-semibold">
              {order.poNumber}
            </h2>
            <p className="text-sm text-muted">
              {order.supplierName || "No supplier"} · Requested by {order.requestedBy || "—"} · Saved for{" "}
              {formatDate(order.orderDate)} · {order.lineCount}{" "}
              {order.lineCount === 1 ? "product" : "products"}
            </p>
          </div>
          <div className="flex gap-2">
            <button
              className={btnSecondaryClass}
              type="button"
              onClick={refresh}
              disabled={refreshing}
              title="Reload on-hand balances and monthly use, including anything recorded since this draft was saved."
            >
              {refreshing ? "Refreshing…" : "Refresh"}
            </button>
            <button className={btnSecondaryClass} type="button" onClick={onClose}>
              Close
            </button>
          </div>
        </div>
        <p className="mt-2 text-xs text-muted">
          On hand and monthly use as of {formatDateTime(checkedAt)}. Refresh to include stock movements recorded since.
        </p>

        <div className="mt-3 min-h-0 overflow-auto rounded-lg border border-border">
          <table className={tableClass}>
            <thead>
              <tr>
                <th className={thClass}>Product</th>
                <th className={thClass}>SKU</th>
                <th className={cn(thClass, "text-right")}>On hand</th>
                <th className={cn(thClass, "text-right")}>Monthly use</th>
                <th className={cn(thClass, "text-right")}>Quantity</th>
                <th className={cn(thClass, "text-right")}>Unit price</th>
                <th className={cn(thClass, "text-right")}>Line total</th>
              </tr>
            </thead>
            {groups.map((group) => (
              <tbody key={group.brand}>
                <tr className="border-t-2 border-sky-300 bg-sky-100 text-sky-950">
                  <td className={cn(tdClass, "text-sm font-bold uppercase tracking-wide")} colSpan={6}>
                    {group.brand}
                    <span className="ml-2 text-xs font-medium normal-case tracking-normal text-sky-800">
                      {group.lines.length} {group.lines.length === 1 ? "product" : "products"}
                    </span>
                  </td>
                  <td className={cn(tdClass, "text-right font-bold tabular-nums")}>{formatMoney(group.total)}</td>
                </tr>
                {group.lines.map((line) => {
                  const product = productById.get(line.productId);
                  return (
                    <tr key={line.id}>
                      <td className={tdClass}>{line.label}</td>
                      <td className={cn(tdClass, "text-muted")}>{line.sku || "—"}</td>
                      <td className={cn(tdClass, "text-right font-medium tabular-nums", refreshing && "opacity-50")}>
                        {product ? formatQty(product.onHand) : "—"}
                      </td>
                      <td className={cn(tdClass, "text-right tabular-nums", refreshing && "opacity-50")}>
                        {product && !product.isBundle ? formatQty(product.monthlyUse) : "—"}
                      </td>
                      <td className={cn(tdClass, "text-right tabular-nums")}>{formatQty(line.quantity)}</td>
                      <td className={cn(tdClass, "text-right tabular-nums")}>{formatMoney(line.unitPrice)}</td>
                      <td className={cn(tdClass, "text-right tabular-nums")}>
                        {formatMoney(line.quantity * line.unitPrice)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            ))}
            <tfoot>
              <tr className="font-semibold">
                <td className={tdClass} colSpan={6}>
                  Total (w/o tax)
                </td>
                <td className={cn(tdClass, "text-right tabular-nums")}>{formatMoney(order.subtotalAmount)}</td>
              </tr>
              <tr className="font-semibold">
                <td className={tdClass} colSpan={6}>
                  Total (w/ tax)
                </td>
                <td className={cn(tdClass, "text-right tabular-nums")}>{formatMoney(order.totalAmount)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </div>
  );
}
