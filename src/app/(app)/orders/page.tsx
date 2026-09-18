import { requireBranch } from "@/lib/auth";
import { getOrderBalanceProducts } from "@/lib/data/products";
import { getPurchaseOrders } from "@/lib/data/orders";
import { getSuppliers, getTaxRates } from "@/lib/data/lookups";
import { computeOrderTotals } from "../stock-in/order-totals-calc";
import { OrdersWorkspace } from "./orders-workspace";

export default async function OrdersPage() {
  const { supabase, companyId, branch } = await requireBranch();
  const [products, orders, suppliers, taxRates] = await Promise.all([
    getOrderBalanceProducts(supabase, companyId, branch.id),
    getPurchaseOrders(supabase, companyId, branch.id),
    getSuppliers(supabase, companyId),
    getTaxRates(supabase, companyId),
  ]);
  const gstRate = Number(taxRates.find((rate) => rate.is_default)?.rate_percentage ?? 9);

  const orderRows = orders.map((order) => {
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
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Orders</h1>
        <p className="mt-1 text-sm text-muted">
          Working in {branch.displayName}. Check what&apos;s on hand and put together a new order — stock only
          moves once it&apos;s received in Stock-in.
        </p>
      </div>

      <OrdersWorkspace
        branchId={branch.id}
        products={products}
        suppliers={suppliers.map((supplier) => ({
          id: supplier.id,
          label: supplier.supplier_name,
          gstRegistered: supplier.gst_registered,
        }))}
        gstRate={gstRate}
        orders={orderRows}
      />
    </div>
  );
}
