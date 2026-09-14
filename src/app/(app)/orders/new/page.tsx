import Link from "next/link";
import { requireBranch } from "@/lib/auth";
import { getProducts, getSuppliers, getTaxRates } from "@/lib/data/lookups";
import { getProductBranchCosts, pickPrimaryClassification } from "@/lib/data/products";
import { productDisplayName } from "@/lib/format";
import { OrderForm } from "./order-form";

export default async function NewOrderPage() {
  const { supabase, companyId, branch } = await requireBranch();
  const [suppliers, products, taxRates, branchCosts] = await Promise.all([
    getSuppliers(supabase, companyId),
    getProducts(supabase, companyId),
    getTaxRates(supabase, companyId),
    getProductBranchCosts(supabase, companyId),
  ]);
  const gstRate = Number(taxRates.find((rate) => rate.is_default)?.rate_percentage ?? 9);

  return (
    <div className="space-y-6">
      <div>
        <Link href="/orders" className="text-sm text-muted underline">
          Back to orders
        </Link>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">New purchase order</h1>
        <p className="mt-1 text-sm text-muted">
          Working in {branch.displayName}. Classification is set on each line. Stock is not added
          until the order is received.
        </p>
      </div>

      {suppliers.length === 0 || products.length === 0 ? (
        <p className="rounded-xl border border-border bg-card p-4 text-sm text-muted">
          Add at least one{" "}
          <Link href="/admin" className="underline">
            supplier
          </Link>{" "}
          and one{" "}
          <Link href="/home/products" className="underline">
            product
          </Link>{" "}
          before creating an order.
        </p>
      ) : (
        <OrderForm
          key={branch.id}
          branchId={branch.id}
          gstRate={gstRate}
          suppliers={suppliers.map((supplier) => ({
            id: supplier.id,
            label: supplier.supplier_name,
            gstRegistered: supplier.gst_registered,
          }))}
          products={products.map((product) => ({
            id: product.id,
            label: productDisplayName(product) || product.sku || product.id,
            defaultClassification: pickPrimaryClassification(
              (product.product_branch_classifications ?? [])
                .filter((row) => row.branch_id === branch.id)
                .map((row) => row.classification),
            ),
            unitCost: Number(product.unit_cost_price),
            sku: product.sku,
            sizeLabel: product.size_label,
            barcode: product.barcode,
            branchAvgCost: branchCosts[product.id]?.[branch.id] ?? null,
          }))}
        />
      )}
    </div>
  );
}
