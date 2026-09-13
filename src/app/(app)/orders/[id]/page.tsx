import { notFound } from "next/navigation";
import { requireBranch } from "@/lib/auth";
import { canMarkSent, canReceive, getPurchaseOrder } from "@/lib/data/orders";
import { getProducts, getSuppliers } from "@/lib/data/lookups";
import { pickPrimaryClassification } from "@/lib/data/products";
import { productLabel } from "@/lib/format";
import { OrderDetailPanel } from "./order-detail-panel";

export default async function OrderDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { supabase, companyId, branch } = await requireBranch();
  const order = await getPurchaseOrder(supabase, companyId, id, branch.id).catch(() => null);

  if (!order) notFound();

  const supplier = Array.isArray(order.suppliers) ? order.suppliers[0] : order.suppliers;
  const orderBranch = Array.isArray(order.branches) ? order.branches[0] : order.branches;
  const editableOrder = order.status === "draft";

  const [suppliers, products] = editableOrder
    ? await Promise.all([
        getSuppliers(supabase, companyId),
        getProducts(supabase, companyId),
      ])
    : [[], []];

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
  }));

  return (
    <OrderDetailPanel
      poNumber={order.po_number}
      purchaseOrderId={order.id}
      status={order.status}
      branchName={orderBranch?.name ?? ""}
      supplierId={order.supplier_id}
      supplierName={supplier?.supplier_name ?? ""}
      orderDate={order.order_date ?? ""}
      expectedDeliveryDate={order.expected_delivery_date}
      notes={order.notes}
      suppliers={suppliers.map((item) => ({ id: item.id, label: item.supplier_name }))}
      canMarkSentNow={canMarkSent(order.status)}
      canReceiveNow={canReceive(order.status)}
      items={items}
      products={products.map((product) => ({
        id: product.id,
        label: productLabel(product),
        defaultClassification: pickPrimaryClassification(
          (product.product_branch_classifications ?? [])
            .filter((row) => row.branch_id === branch.id)
            .map((row) => row.classification),
        ),
        unitCost: Number(product.unit_cost_price),
      }))}
      receipts={receipts}
    />
  );
}
