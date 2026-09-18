import { notFound } from "next/navigation";
import { requireBranch } from "@/lib/auth";
import { canAddFreeGoods, canReceive, canVoid, getPurchaseOrder } from "@/lib/data/orders";
import { getSuppliers, getTaxRates } from "@/lib/data/lookups";
import { getOrderProductOptions } from "@/lib/data/products";
import { productDisplayName, productLabel } from "@/lib/format";
import type { ProductClassification } from "@/lib/labels";
import { OrderDetailPanel } from "./order-detail-panel";

export default async function OrderDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { supabase, companyId, branch } = await requireBranch();
  const [order, taxRates] = await Promise.all([
    getPurchaseOrder(supabase, companyId, id, branch.id).catch(() => null),
    getTaxRates(supabase, companyId),
  ]);

  if (!order) notFound();

  const supplier = Array.isArray(order.suppliers) ? order.suppliers[0] : order.suppliers;
  const orderBranch = Array.isArray(order.branches) ? order.branches[0] : order.branches;
  const editableOrder = order.status === "draft";
  const addFreeGoodsNow = canAddFreeGoods(order.status);
  const gstRate = Number(taxRates.find((rate) => rate.is_default)?.rate_percentage ?? 9);

  const [suppliers, products] = await Promise.all([
    editableOrder ? getSuppliers(supabase, companyId) : Promise.resolve([]),
    editableOrder || addFreeGoodsNow ? getOrderProductOptions(supabase, companyId, branch.id) : Promise.resolve([]),
  ]);

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
      gstRegistered={supplier?.gst_registered ?? false}
      gstRate={gstRate}
      orderDate={order.order_date ?? ""}
      expectedDeliveryDate={order.expected_delivery_date}
      notes={order.notes}
      suppliers={suppliers.map((item) => ({ id: item.id, label: item.supplier_name, gstRegistered: item.gst_registered }))}
      canReceiveNow={canReceive(order.status)}
      canVoidNow={canVoid(order.status)}
      canAddFreeGoodsNow={addFreeGoodsNow}
      items={items}
      products={products}
      receipts={receipts}
      freeGoodsSummary={freeGoodsSummary}
      auditEvents={auditEvents}
    />
  );
}
