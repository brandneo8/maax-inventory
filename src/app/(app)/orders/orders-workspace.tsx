"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import type { OrderBalanceProduct } from "@/lib/data/products";
import { formatDate, formatMoney } from "@/lib/format";
import { tableClass, tdClass, thClass } from "@/lib/ui";
import { InventoryBalancePane } from "./inventory-balance-pane";

type SupplierOption = { id: string; label: string; gstRegistered: boolean };
type Tab = "balance" | "orders";

export type DraftOrderRow = {
  id: string;
  poNumber: string;
  supplierName: string;
  orderDate: string | null;
  lineCount: number;
  subtotalAmount: number;
  totalAmount: number;
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
  const [savedPoNumber, setSavedPoNumber] = useState<string | null>(null);

  function onSaved(poNumber: string) {
    setSavedPoNumber(poNumber);
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
          Draft orders ({orders.length})
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
        <DraftOrdersTable orders={orders} savedPoNumber={savedPoNumber} />
      )}
    </div>
  );
}

/** Orders saved from the planning form: a read-only list, nothing to receive here. */
function DraftOrdersTable({ orders, savedPoNumber }: { orders: DraftOrderRow[]; savedPoNumber: string | null }) {
  const subtotal = orders.reduce((sum, order) => sum + order.subtotalAmount, 0);
  const total = orders.reduce((sum, order) => sum + order.totalAmount, 0);

  return (
    <div className="space-y-3">
      {savedPoNumber ? (
        <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
          Saved {savedPoNumber} as a draft order.
        </p>
      ) : null}
      <div className="overflow-x-auto rounded-xl border border-border bg-card">
        <table className={tableClass}>
          <thead>
            <tr>
              <th className={thClass}>Order</th>
              <th className={thClass}>Supplier</th>
              <th className={thClass}>Saved for</th>
              <th className={cn(thClass, "text-right")}>Products</th>
              <th className={cn(thClass, "text-right")}>Total (w/o tax)</th>
              <th className={cn(thClass, "text-right")}>Total (w/ tax)</th>
            </tr>
          </thead>
          <tbody>
            {orders.length === 0 ? (
              <tr>
                <td className={cn(tdClass, "text-muted")} colSpan={6}>
                  No draft orders yet. Build one in Inventory balance and save it.
                </td>
              </tr>
            ) : (
              orders.map((order) => (
                <tr key={order.id} className={cn(order.poNumber === savedPoNumber && "bg-emerald-50/60")}>
                  <td className={cn(tdClass, "whitespace-nowrap font-medium")}>{order.poNumber}</td>
                  <td className={tdClass}>{order.supplierName || "—"}</td>
                  <td className={cn(tdClass, "whitespace-nowrap")}>{formatDate(order.orderDate)}</td>
                  <td className={cn(tdClass, "text-right tabular-nums")}>{order.lineCount}</td>
                  <td className={cn(tdClass, "text-right tabular-nums")}>{formatMoney(order.subtotalAmount)}</td>
                  <td className={cn(tdClass, "text-right tabular-nums")}>{formatMoney(order.totalAmount)}</td>
                </tr>
              ))
            )}
          </tbody>
          {orders.length > 0 ? (
            <tfoot>
              <tr className="font-semibold">
                <td className={tdClass} colSpan={4}>
                  All draft orders
                </td>
                <td className={cn(tdClass, "text-right tabular-nums")}>{formatMoney(subtotal)}</td>
                <td className={cn(tdClass, "text-right tabular-nums")}>{formatMoney(total)}</td>
              </tr>
            </tfoot>
          ) : null}
        </table>
      </div>
    </div>
  );
}
