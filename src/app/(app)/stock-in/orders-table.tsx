"use client";

import Link from "next/link";
import { useMemo, useState, type ReactNode } from "react";
import { formatDate, formatMoney } from "@/lib/format";
import { poStatusLabel, type PoStatus } from "@/lib/labels";
import { fieldClass, tableClass, tdClass, thClass } from "@/lib/ui";
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
  /** Brands of the products on the order, A–Z. */
  brands: string[];
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
  const [supplierFilter, setSupplierFilter] = useState("");
  const [brandFilter, setBrandFilter] = useState("");

  const supplierOptions = useMemo(
    () => [...new Set(orders.map((order) => order.supplierName).filter(Boolean))].sort((a, b) => a.localeCompare(b)),
    [orders],
  );
  const brandOptions = useMemo(
    () => [...new Set(orders.flatMap((order) => order.brands))].sort((a, b) => a.localeCompare(b)),
    [orders],
  );
  const filteredOrders = useMemo(
    () =>
      orders.filter(
        (order) =>
          (!supplierFilter || order.supplierName === supplierFilter) &&
          (!brandFilter || order.brands.includes(brandFilter)),
      ),
    [orders, supplierFilter, brandFilter],
  );

  function toggleSort(column: SortColumn) {
    if (sortColumn === column) {
      setSortDirection((direction) => (direction === "asc" ? "desc" : "asc"));
    } else {
      setSortColumn(column);
      setSortDirection("asc");
    }
  }

  const activeCount = useMemo(
    () => filteredOrders.filter((order) => order.status !== "cancelled").length,
    [filteredOrders],
  );
  const voidedCount = filteredOrders.length - activeCount;

  const sortedOrders = useMemo(() => {
    const filtered = filteredOrders.filter((order) =>
      view === "voided" ? order.status === "cancelled" : order.status !== "cancelled",
    );
    return filtered.sort((a, b) => compareRows(a, b, sortColumn, sortDirection));
  }, [filteredOrders, view, sortColumn, sortDirection]);

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

      <div className="flex flex-wrap items-end gap-3">
        <label className="space-y-1 text-sm">
          <span className="text-muted">Supplier</span>
          <select
            id="stock-in-supplier-filter"
            className={cn(fieldClass, "min-w-48")}
            value={supplierFilter}
            onChange={(event) => setSupplierFilter(event.target.value)}
          >
            <option value="">All suppliers</option>
            {supplierOptions.map((supplier) => (
              <option key={supplier} value={supplier}>
                {supplier}
              </option>
            ))}
          </select>
        </label>
        <label className="space-y-1 text-sm">
          <span className="text-muted">Brand</span>
          <select
            id="stock-in-brand-filter"
            className={cn(fieldClass, "min-w-48")}
            value={brandFilter}
            onChange={(event) => setBrandFilter(event.target.value)}
          >
            <option value="">All brands</option>
            {brandOptions.map((brand) => (
              <option key={brand} value={brand}>
                {brand}
              </option>
            ))}
          </select>
        </label>
        {supplierFilter || brandFilter ? (
          <button
            type="button"
            className="pb-2 text-sm text-muted underline"
            onClick={() => {
              setSupplierFilter("");
              setBrandFilter("");
            }}
          >
            Clear filters
          </button>
        ) : null}
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
            <th className={thClass}>Brands</th>
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
              <td className={tdClass} colSpan={10}>
                {supplierFilter || brandFilter
                  ? "No orders match these filters."
                  : view === "voided"
                    ? "No voided purchase orders."
                    : "No active purchase orders yet."}
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
                <td className={cn(tdClass, "max-w-56")}>
                  {order.brands.length > 0 ? (
                    <div className="flex flex-wrap gap-1">
                      {order.brands.map((brand) => (
                        <span
                          key={brand}
                          className="rounded-full border border-border bg-slate-50 px-2 py-0.5 text-xs text-slate-700"
                        >
                          {brand}
                        </span>
                      ))}
                    </div>
                  ) : (
                    "—"
                  )}
                </td>
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
