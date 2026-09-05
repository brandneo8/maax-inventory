import Link from "next/link";
import { requireBranch } from "@/lib/auth";
import { getPurchaseOrders } from "@/lib/data/orders";
import { formatDate } from "@/lib/format";
import { poStatusLabel } from "@/lib/labels";
import { btnClass, tableClass, tdClass, thClass } from "@/lib/ui";

export default async function OrdersPage() {
  const { supabase, companyId, branch } = await requireBranch();
  const orders = await getPurchaseOrders(supabase, companyId, branch.id);

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Purchase orders</h1>
          <p className="mt-1 text-sm text-muted">
            Draft an order, mark it sent, then receive stock into a branch location.
          </p>
        </div>
        <Link className={btnClass} href="/orders/new">
          New order
        </Link>
      </div>

      <div className="overflow-x-auto rounded-xl border border-border bg-card">
        <table className={tableClass}>
          <thead>
            <tr>
              <th className={thClass}>PO</th>
              <th className={thClass}>Supplier</th>
              <th className={thClass}>Branch</th>
              <th className={thClass}>Status</th>
              <th className={thClass}>Order date</th>
            </tr>
          </thead>
          <tbody>
            {orders.length === 0 ? (
              <tr>
                <td className={tdClass} colSpan={5}>
                  No purchase orders yet.
                </td>
              </tr>
            ) : (
              orders.map((order) => {
                const supplier = Array.isArray(order.suppliers)
                  ? order.suppliers[0]
                  : order.suppliers;
                const branch = Array.isArray(order.branches) ? order.branches[0] : order.branches;
                return (
                  <tr key={order.id}>
                    <td className={tdClass}>
                      <Link className="underline" href={`/orders/${order.id}`}>
                        {order.po_number}
                      </Link>
                    </td>
                    <td className={tdClass}>{supplier?.supplier_name ?? "—"}</td>
                    <td className={tdClass}>{branch?.name ?? "—"}</td>
                    <td className={tdClass}>{poStatusLabel(order.status)}</td>
                    <td className={tdClass}>{formatDate(order.order_date)}</td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
