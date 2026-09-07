import Link from "next/link";
import { notFound } from "next/navigation";
import { requireBranch } from "@/lib/auth";
import { getUninvoicedReceiptsForOrder } from "@/lib/data/invoices";
import { canMarkSent, canReceive, getPurchaseOrder } from "@/lib/data/orders";
import { formatDate, formatMoney, formatQty, productLabel } from "@/lib/format";
import { classificationLabel, poStatusLabel } from "@/lib/labels";
import { btnClass, btnSecondaryClass, tableClass, tdClass, thClass } from "@/lib/ui";
import { markPurchaseOrderSent } from "../actions";

export default async function OrderDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { supabase, companyId, branch } = await requireBranch();
  const [order, uninvoicedReceipts] = await Promise.all([
    getPurchaseOrder(supabase, companyId, id, branch.id).catch(() => null),
    getUninvoicedReceiptsForOrder(supabase, companyId, id).catch(() => []),
  ]);

  if (!order) notFound();

  const supplier = Array.isArray(order.suppliers) ? order.suppliers[0] : order.suppliers;
  const orderBranch = Array.isArray(order.branches) ? order.branches[0] : order.branches;

  return (
    <div className="space-y-6">
      <div>
        <Link href="/orders" className="text-sm text-muted underline">
          Back to orders
        </Link>
        <div className="mt-2 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">{order.po_number}</h1>
            <p className="mt-1 text-sm text-muted">
              {supplier?.supplier_name} · {orderBranch?.name} · {poStatusLabel(order.status)}
            </p>
          </div>
          <div className="flex gap-2">
            {canMarkSent(order.status) ? (
              <form action={markPurchaseOrderSent}>
                <input type="hidden" name="id" value={order.id} />
                <button className={btnClass} type="submit">
                  Mark sent
                </button>
              </form>
            ) : null}
            {canReceive(order.status) ? (
              <Link className={btnSecondaryClass} href={`/orders/${order.id}/receive`}>
                Receive stock
              </Link>
            ) : null}
            {uninvoicedReceipts.length > 0 ? (
              <Link className={btnSecondaryClass} href="/invoices/new">
                Create invoice
              </Link>
            ) : null}
          </div>
        </div>
      </div>

      <dl className="grid gap-3 rounded-xl border border-border bg-card p-4 text-sm sm:grid-cols-3">
        <div>
          <dt className="text-muted">Order date</dt>
          <dd>{formatDate(order.order_date)}</dd>
        </div>
        <div>
          <dt className="text-muted">Expected delivery</dt>
          <dd>{formatDate(order.expected_delivery_date)}</dd>
        </div>
        <div>
          <dt className="text-muted">Notes</dt>
          <dd>{order.notes || "—"}</dd>
        </div>
      </dl>

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
            {order.items.map((item) => {
              const product = Array.isArray(item.products) ? item.products[0] : item.products;
              return (
                <tr key={item.id}>
                  <td className={tdClass}>
                    {productLabel(product, item.product_id)}
                  </td>
                  <td className={tdClass}>{classificationLabel(item.classification)}</td>
                  <td className={tdClass}>{formatQty(item.quantity_ordered)}</td>
                  <td className={tdClass}>{formatQty(item.quantity_received)}</td>
                  <td className={tdClass}>{formatMoney(item.unit_price)}</td>
                  <td className={tdClass}>{formatMoney(item.line_total)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
