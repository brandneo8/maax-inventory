import { requireBranch } from "@/lib/auth";
import { getOrderBalanceProducts } from "@/lib/data/products";
import { getPurchaseOrders } from "@/lib/data/orders";
import { getSuppliers, getTaxRates } from "@/lib/data/lookups";
import { productDisplayName } from "@/lib/format";
import { computeOrderTotals } from "../stock-in/order-totals-calc";
import { OrdersWorkspace, type DraftOrderRow } from "./orders-workspace";

export default async function OrdersPage() {
  const { supabase, companyId, branch } = await requireBranch();
  const [products, orders, suppliers, taxRates] = await Promise.all([
    getOrderBalanceProducts(supabase, companyId, branch.id),
    getPurchaseOrders(supabase, companyId, branch.id, true),
    getSuppliers(supabase, companyId),
    getTaxRates(supabase, companyId),
  ]);
  const gstRate = Number(taxRates.find((rate) => rate.is_default)?.rate_percentage ?? 9);

  // Planning drafts saved from this page — they never go to Stock-in.
  const orderRows: DraftOrderRow[] = orders
    .filter((order) => order.status === "draft" || order.status === "sent")
    .map((order) => {
      const supplier = Array.isArray(order.suppliers) ? order.suppliers[0] : order.suppliers;
      const items = order.purchase_order_items ?? [];
      const { subtotal, grandTotal } = computeOrderTotals(
        items.map((item) => ({
          quantity_ordered: Number(item.quantity_ordered),
          unit_price: Number(item.unit_price),
        })),
        supplier?.gst_registered ?? false,
        gstRate,
      );
      return {
        id: order.id,
        poNumber: order.po_number,
        supplierName: supplier?.supplier_name ?? "",
        orderDate: order.order_date,
        sent: order.status === "sent",
        sentDate: order.sent_date,
        sentBy: order.sent_by,
        requestedBy: order.requested_by,
        lineCount: items.length,
        lines: [...items]
          .sort((left, right) => (left.sort_order ?? 0) - (right.sort_order ?? 0))
          .map((item) => {
            const product = Array.isArray(item.products) ? item.products[0] : item.products;
            const brand = Array.isArray(product?.brands) ? product?.brands[0] : product?.brands;
            return {
              id: item.id,
              productId: item.product_id,
              brand: brand?.name?.trim() || "",
              label: productDisplayName(product) || "—",
              sku: product?.sku ?? null,
              quantity: Number(item.quantity_ordered),
              unitPrice: Number(item.unit_price),
            };
          }),
        totalAmount: grandTotal,
        subtotalAmount: subtotal,
      };
    });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Orders</h1>
        <p className="mt-1 text-sm text-muted">
          Working in {branch.displayName}. Check what&apos;s on hand and put together an order. Saved orders are
          kept here as drafts and don&apos;t change stock.
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
