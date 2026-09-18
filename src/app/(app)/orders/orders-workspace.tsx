"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import type { OrderBalanceProduct } from "@/lib/data/products";
import { InventoryBalancePane } from "./inventory-balance-pane";
import { OrdersTable, type OrderRow } from "../stock-in/orders-table";

type SupplierOption = { id: string; label: string; gstRegistered: boolean };
type Tab = "balance" | "orders";

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
  orders: OrderRow[];
}) {
  const [tab, setTab] = useState<Tab>("balance");

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
          Orders ({orders.length})
        </button>
      </div>

      {tab === "balance" ? (
        <InventoryBalancePane branchId={branchId} products={products} suppliers={suppliers} gstRate={gstRate} />
      ) : (
        <OrdersTable orders={orders} />
      )}
    </div>
  );
}
