import Link from "next/link";
import { notFound } from "next/navigation";
import { requireBranch } from "@/lib/auth";
import { getStoreLocations, getTaxRates } from "@/lib/data/lookups";
import { canReceive, getPurchaseOrder } from "@/lib/data/orders";
import { getBundleContents, getCatalogProducts, getProductBranchCosts, pickPrimaryClassification } from "@/lib/data/products";
import { productDisplayName, productLabel } from "@/lib/format";
import { ReceiveForm } from "./receive-form";

export default async function ReceiveOrderPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { supabase, companyId, branch } = await requireBranch();
  const [order, locations, catalog, taxRates, branchCosts] = await Promise.all([
    getPurchaseOrder(supabase, companyId, id, branch.id).catch(() => null),
    getStoreLocations(supabase, companyId),
    getCatalogProducts(supabase, companyId),
    getTaxRates(supabase, companyId),
    getProductBranchCosts(supabase, companyId),
  ]);

  if (!order) notFound();

  const bundleContents = await getBundleContents(
    supabase,
    order.items.map((item) => item.product_id),
  );

  const branchLocations = locations.filter((location) => location.branch_id === order.branch_id);
  const supplier = Array.isArray(order.suppliers) ? order.suppliers[0] : order.suppliers;
  const gstRegistered = supplier?.gst_registered ?? false;
  const gstRate = Number(taxRates.find((rate) => rate.is_default)?.rate_percentage ?? 9);

  return (
    <div className="space-y-6">
      <div>
        <Link href={`/orders/${order.id}`} className="text-sm text-muted underline">
          Back to {order.po_number}
        </Link>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">Receive {order.po_number}</h1>
        <p className="mt-1 text-sm text-muted">
          Receiving writes the ledger and updates ordered vs received quantities automatically.
        </p>
      </div>

      {!canReceive(order.status) ? (
        <p className="rounded-xl border border-border bg-card p-4 text-sm text-muted">
          Mark this order as sent before receiving stock.
        </p>
      ) : branchLocations.length === 0 ? (
        <p className="rounded-xl border border-border bg-card p-4 text-sm text-muted">
          This salon isn’t set up for stock yet.
        </p>
      ) : (
        <ReceiveForm
          purchaseOrderId={order.id}
          defaultLocationId={branchLocations[0].id}
          gstRegistered={gstRegistered}
          gstRate={gstRate}
          products={catalog.map((product) => ({
            id: product.id,
            label: productLabel(product),
            sku: product.sku,
            barcode: product.barcode,
            defaultClassification: pickPrimaryClassification(product.classificationsByBranch[branch.id]),
          }))}
          lines={order.items.map((item) => {
            const product = Array.isArray(item.products) ? item.products[0] : item.products;
            return {
              purchase_order_item_id: item.id,
              product_id: item.product_id,
              sku: product?.sku ?? null,
              sizeLabel: product?.size_label ?? null,
              label: productDisplayName(product) || item.product_id,
              classification: item.classification,
              ordered: Number(item.quantity_ordered),
              ordered_unit_price: Number(item.unit_price),
              remaining: Number(item.quantity_ordered) - Number(item.quantity_received),
              unit_cost: Number(item.unit_price),
              branchAvgCost: branchCosts[item.product_id]?.[branch.id] ?? null,
              contents: (bundleContents.get(item.product_id) ?? []).map((component) => ({
                label: component.label,
                quantity: component.quantity,
              })),
            };
          })}
        />
      )}
    </div>
  );
}
