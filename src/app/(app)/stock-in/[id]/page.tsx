import Link from "next/link";
import { notFound } from "next/navigation";
import { requireBranch } from "@/lib/auth";
import { getLatestPostedCountDate } from "@/lib/data/counts";
import { canAddFreeGoods, canVoid, getPurchaseOrder } from "@/lib/data/orders";
import { getSuppliers, getTaxRates } from "@/lib/data/lookups";
import { getOrderProductOptions } from "@/lib/data/products";
import { productDisplayName, productLabel } from "@/lib/format";
import type { ProductClassification } from "@/lib/labels";
import { OrderDetailPanel } from "./order-detail-panel";
import { StockInForm } from "../stock-in-form";

export default async function OrderDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const [{ id }, { supabase, companyId, branch }] = await Promise.all([params, requireBranch()]);
  const [order, taxRates] = await Promise.all([
    getPurchaseOrder(supabase, companyId, id, branch.id).catch(() => null),
    getTaxRates(supabase, companyId),
  ]);

  if (!order) notFound();

  const supplier = Array.isArray(order.suppliers) ? order.suppliers[0] : order.suppliers;
  const orderBranch = Array.isArray(order.branches) ? order.branches[0] : order.branches;
  const addFreeGoodsNow = canAddFreeGoods(order.status);
  // A received order's supplier can be changed (OrderDetailPanel's SupplierEditor).
  const supplierOptionsPromise =
    order.status === "draft" || order.status === "cancelled" ? Promise.resolve([]) : getSuppliers(supabase, companyId);
  const gstRate = Number(taxRates.find((rate) => rate.is_default)?.rate_percentage ?? 9);

  // A draft opens in the stock-in form (products and quantities, prices,
  // invoice and FX, then receive). Received and voided orders show below.
  // "Add free goods" fetches the catalog when its modal opens
  // (free-goods-actions.ts), so received orders don't load it on every view.
  if (order.status === "draft") {
    const [suppliers, products, latestCountDate] = await Promise.all([
      getSuppliers(supabase, companyId),
      getOrderProductOptions(supabase, companyId, branch.id),
      getLatestPostedCountDate(supabase, companyId, branch.id),
    ]);
    return (
      <div className="space-y-6">
        <div>
          <Link href="/stock-in" className="text-sm text-muted underline">
            Back to stock-in
          </Link>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight">{order.po_number}</h1>
          <p className="mt-1 text-sm text-muted">
            Draft at {branch.displayName}. Confirm the quantities, then the prices, invoice and FX, and receive it into
            stock.
          </p>
        </div>
        <StockInForm
          key={order.id}
          branchName={branch.displayName}
          gstRate={gstRate}
          latestCountDate={latestCountDate}
          suppliers={suppliers
            // Inactive suppliers stay listed for a draft that already uses one.
            .filter((item) => item.is_active || item.id === order.supplier_id)
            .map((item) => ({ id: item.id, label: item.supplier_name, gstRegistered: item.gst_registered }))}
          products={products}
          draft={{
            id: order.id,
            poNumber: order.po_number,
            supplierId: order.supplier_id,
            orderDate: order.order_date ?? "",
            notes: order.notes ?? "",
            fxAdjustment: Number(order.fx_adjustment ?? 0),
            lines: order.items
              .filter((item) => !item.is_free)
              .map((item) => ({
                key: item.id,
                product_id: item.product_id,
                classification: item.classification,
                quantity_ordered: Number(item.quantity_ordered),
                unit_price: Number(item.unit_price),
              })),
            // Free goods saved on the draft ($0 lines marked is_free).
            freeLines: order.items
              .filter((item) => item.is_free)
              .map((item) => ({
                key: item.id,
                product_id: item.product_id,
                classification: item.classification,
                quantity: Number(item.quantity_ordered),
              })),
          }}
        />
      </div>
    );
  }

  const items = order.items.map((item) => {
    const product = Array.isArray(item.products) ? item.products[0] : item.products;
    return {
      id: item.id,
      product_id: item.product_id,
      label: productLabel(product, item.product_id),
      classification: item.classification,
      quantity_ordered: Number(item.quantity_ordered),
      quantity_received: Number(item.quantity_received),
      unit_price: Number(item.unit_price),
      line_total: Number(item.line_total),
    };
  });

  const receipts = order.receipts.map((receipt) => ({
    id: receipt.id,
    receivedDate: receipt.received_date,
    receivedBy: receipt.received_by,
    notes: receipt.notes,
    invoiceReference: receipt.invoice_reference,
    invoiceAttachmentUrl: receipt.invoice_attachment_url,
    roundingAdjustment: Number(receipt.rounding_adjustment ?? 0),
    fxAdjustment: Number(receipt.fx_adjustment ?? 0),
  }));

  const freeGoodsByProduct = new Map<string, { productId: string; label: string; classification: ProductClassification | null; quantity: number }>();
  for (const receipt of order.receipts) {
    for (const item of receipt.goods_receipt_items ?? []) {
      if (item.purchase_order_item_id) continue;
      const product = Array.isArray(item.products) ? item.products[0] : item.products;
      const existing = freeGoodsByProduct.get(item.product_id);
      if (existing) {
        existing.quantity += Number(item.quantity_received);
      } else {
        freeGoodsByProduct.set(item.product_id, {
          productId: item.product_id,
          label: productDisplayName(product) || item.product_id,
          classification: item.classification,
          quantity: Number(item.quantity_received),
        });
      }
    }
  }
  const freeGoodsSummary = [...freeGoodsByProduct.values()];

  const auditEvents = order.auditEvents.map((event) => ({
    id: event.id,
    eventType: event.event_type,
    actorName: event.actor_name,
    remarks: event.remarks,
    createdAt: event.created_at,
  }));

  return (
    <OrderDetailPanel
      poNumber={order.po_number}
      purchaseOrderId={order.id}
      status={order.status}
      branchName={orderBranch?.name ?? ""}
      supplierId={order.supplier_id}
      supplierName={supplier?.supplier_name ?? ""}
      suppliers={(await supplierOptionsPromise)
        .filter((item) => item.is_active || item.id === order.supplier_id)
        .map((item) => ({ id: item.id, label: item.supplier_name }))}
      gstRegistered={supplier?.gst_registered ?? false}
      gstRate={gstRate}
      orderDate={order.order_date ?? ""}
      expectedDeliveryDate={order.expected_delivery_date}
      notes={order.notes}
      canVoidNow={canVoid(order.status)}
      canAddFreeGoodsNow={addFreeGoodsNow}
      items={items}
      receipts={receipts}
      plannedFxAdjustment={Number(order.fx_adjustment ?? 0)}
      freeGoodsSummary={freeGoodsSummary}
      auditEvents={auditEvents}
    />
  );
}
