import Link from "next/link";
import { requireBranch } from "@/lib/auth";
import { getPurchaseOrders } from "@/lib/data/orders";
import { getTaxRates } from "@/lib/data/lookups";
import { computeOrderTotals } from "./order-totals-calc";
import { btnClass } from "@/lib/ui";
import { OrdersTable } from "./orders-table";

export default async function OrdersPage() {
  const { supabase, companyId, branch } = await requireBranch();
  const [orders, taxRates] = await Promise.all([
    getPurchaseOrders(supabase, companyId, branch.id),
    getTaxRates(supabase, companyId),
  ]);
  const gstRate = Number(taxRates.find((rate) => rate.is_default)?.rate_percentage ?? 9);

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Purchase orders</h1>
          <p className="mt-1 text-sm text-muted">
            Working in {branch.displayName}. Draft an order, mark it sent, then receive stock into
            this salon.
          </p>
        </div>
        <Link className={btnClass} href="/orders/new">
          New order
        </Link>
      </div>

      <OrdersTable
        orders={orders.map((order) => {
          const supplier = Array.isArray(order.suppliers) ? order.suppliers[0] : order.suppliers;
          const orderBranch = Array.isArray(order.branches) ? order.branches[0] : order.branches;
          const { subtotal, grandTotal } = computeOrderTotals(
            (order.purchase_order_items ?? []).map((item) => ({
              quantity_ordered: Number(item.quantity_ordered),
              unit_price: Number(item.unit_price),
            })),
            supplier?.gst_registered ?? false,
            gstRate,
          );
          const activeReceipts = (order.goods_receipts ?? []).filter((receipt) => !receipt.voided_at);
          const invoiceReferences = [
            ...new Set(activeReceipts.map((receipt) => receipt.invoice_reference?.trim()).filter(Boolean)),
          ] as string[];
          const invoiceAttachmentUrls = activeReceipts
            .map((receipt) => receipt.invoice_attachment_url)
            .filter((url): url is string => Boolean(url));
          return {
            id: order.id,
            poNumber: order.po_number,
            supplierName: supplier?.supplier_name ?? "",
            branchName: orderBranch?.name ?? "",
            status: order.status,
            orderDate: order.order_date,
            totalAmount: grandTotal,
            subtotalAmount: subtotal,
            invoiceReferences,
            invoiceAttachmentUrls,
          };
        })}
      />
    </div>
  );
}
