"use client";

import Link from "next/link";
import { useMemo, useState, type ReactNode } from "react";
import { formatDate, formatMoney } from "@/lib/format";
import { poStatusLabel, type PoStatus } from "@/lib/labels";
import { tableClass, tdClass, thClass } from "@/lib/ui";
import { cn } from "@/lib/utils";
import { PoStatusBadge } from "./po-status-badge";

export type OrderRow = {
  id: string;
  poNumber: string;
  supplierName: string;
  branchName: string;
  status: PoStatus;
  orderDate: string | null;
  totalAmount: number;
  subtotalAmount: number;
  invoiceReferences: string[];
  invoiceAttachmentUrls: string[];
};

type SortColumn = "poNumber" | "supplierName" | "branchName" | "status" | "orderDate" | "totalAmount" | "subtotalAmount";
type SortDirection = "asc" | "desc";

function SortableHeader({
  column,
  active,
  direction,
  onSort,
  children,
}: {
  column: SortColumn;
  active: boolean;
  direction: SortDirection;
  onSort: (column: SortColumn) => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      className="inline-flex items-center gap-1 whitespace-nowrap hover:underline"
      onClick={() => onSort(column)}
    >
      {children}
      {active ? <span aria-hidden="true">{direction === "asc" ? "▲" : "▼"}</span> : null}
    </button>
  );
}

function compareRows(a: OrderRow, b: OrderRow, column: SortColumn, direction: SortDirection) {
  let result: number;
  if (column === "orderDate") {
    result = (a.orderDate ?? "").localeCompare(b.orderDate ?? "");
  } else if (column === "status") {
    result = poStatusLabel(a.status).localeCompare(poStatusLabel(b.status), undefined, { sensitivity: "base" });
  } else if (column === "totalAmount") {
    result = a.totalAmount - b.totalAmount;
  } else if (column === "subtotalAmount") {
    result = a.subtotalAmount - b.subtotalAmount;
  } else {
    result = a[column].localeCompare(b[column], undefined, { sensitivity: "base" });
  }
  return direction === "asc" ? result : -result;
}

type View = "active" | "voided";

export function OrdersTable({ orders }: { orders: OrderRow[] }) {
  const [view, setView] = useState<View>("active");
  const [sortColumn, setSortColumn] = useState<SortColumn>("orderDate");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");

  function toggleSort(column: SortColumn) {
    if (sortColumn === column) {
      setSortDirection((direction) => (direction === "asc" ? "desc" : "asc"));
    } else {
      setSortColumn(column);
      setSortDirection("asc");
    }
  }

  const activeCount = useMemo(() => orders.filter((order) => order.status !== "cancelled").length, [orders]);
  const voidedCount = orders.length - activeCount;

  const sortedOrders = useMemo(() => {
    const filtered = orders.filter((order) =>
      view === "voided" ? order.status === "cancelled" : order.status !== "cancelled",
    );
    return filtered.sort((a, b) => compareRows(a, b, sortColumn, sortDirection));
  }, [orders, view, sortColumn, sortDirection]);

  return (
    <div className="space-y-3">
      <div className="flex gap-2 border-b border-border">
        <button
          type="button"
          onClick={() => setView("active")}
          className={cn(
            "border-b-2 px-3 py-2 text-sm font-medium",
            view === "active" ? "border-slate-900 text-slate-900" : "border-transparent text-muted hover:text-slate-700",
          )}
        >
          Active purchase orders ({activeCount})
        </button>
        <button
          type="button"
          onClick={() => setView("voided")}
          className={cn(
            "border-b-2 px-3 py-2 text-sm font-medium",
            view === "voided" ? "border-slate-900 text-slate-900" : "border-transparent text-muted hover:text-slate-700",
          )}
        >
          Voided ({voidedCount})
        </button>
      </div>

      <div className="overflow-x-auto rounded-xl border border-border bg-card">
      <table className={tableClass}>
        <thead>
          <tr>
            <th className={thClass}>
              <SortableHeader column="poNumber" active={sortColumn === "poNumber"} direction={sortDirection} onSort={toggleSort}>
                PO
              </SortableHeader>
            </th>
            <th className={thClass}>
              <SortableHeader
                column="supplierName"
                active={sortColumn === "supplierName"}
                direction={sortDirection}
                onSort={toggleSort}
              >
                Supplier
              </SortableHeader>
            </th>
            <th className={thClass}>
              <SortableHeader
                column="branchName"
                active={sortColumn === "branchName"}
                direction={sortDirection}
                onSort={toggleSort}
              >
                Branch
              </SortableHeader>
            </th>
            <th className={thClass}>
              <SortableHeader column="status" active={sortColumn === "status"} direction={sortDirection} onSort={toggleSort}>
                Status
              </SortableHeader>
            </th>
            <th className={thClass}>Invoice reference</th>
            <th className={thClass}>Invoice file</th>
            <th className={thClass}>
              <SortableHeader
                column="orderDate"
                active={sortColumn === "orderDate"}
                direction={sortDirection}
                onSort={toggleSort}
              >
                Order date
              </SortableHeader>
            </th>
            <th className={thClass}>
              <SortableHeader
                column="subtotalAmount"
                active={sortColumn === "subtotalAmount"}
                direction={sortDirection}
                onSort={toggleSort}
              >
                Total (w/o tax)
              </SortableHeader>
            </th>
            <th className={thClass}>
              <SortableHeader
                column="totalAmount"
                active={sortColumn === "totalAmount"}
                direction={sortDirection}
                onSort={toggleSort}
              >
                Total (w/ tax)
              </SortableHeader>
            </th>
          </tr>
        </thead>
        <tbody>
          {sortedOrders.length === 0 ? (
            <tr>
              <td className={tdClass} colSpan={9}>
                {view === "voided" ? "No voided purchase orders." : "No active purchase orders yet."}
              </td>
            </tr>
          ) : (
            sortedOrders.map((order) => (
              <tr key={order.id}>
                <td className={tdClass}>
                  <Link className="underline" href={`/stock-in/${order.id}`}>
                    {order.poNumber}
                  </Link>
                </td>
                <td className={tdClass}>{order.supplierName || "—"}</td>
                <td className={tdClass}>{order.branchName || "—"}</td>
                <td className={tdClass}>
                  <PoStatusBadge status={order.status} />
                </td>
                <td className={tdClass}>
                  {order.invoiceReferences.length > 0 ? order.invoiceReferences.join(", ") : "—"}
                </td>
                <td className={tdClass}>
                  {order.invoiceAttachmentUrls.length > 0 ? (
                    <div className="flex flex-wrap gap-2">
                      {order.invoiceAttachmentUrls.map((url, index) => (
                        <a
                          key={url}
                          className="text-blue-600 underline"
                          href={url}
                          target="_blank"
                          rel="noreferrer"
                        >
                          View{order.invoiceAttachmentUrls.length > 1 ? ` ${index + 1}` : ""}
                        </a>
                      ))}
                    </div>
                  ) : (
                    "—"
                  )}
                </td>
                <td className={tdClass}>{formatDate(order.orderDate)}</td>
                <td className={tdClass}>{formatMoney(order.subtotalAmount)}</td>
                <td className={tdClass}>{formatMoney(order.totalAmount)}</td>
              </tr>
            ))
          )}
        </tbody>
      </table>
      </div>
    </div>
  );
}
