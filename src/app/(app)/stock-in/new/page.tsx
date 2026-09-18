import Link from "next/link";
import { requireBranch } from "@/lib/auth";
import { getSuppliers, getTaxRates } from "@/lib/data/lookups";
import { getOrderProductOptions } from "@/lib/data/products";
import { OrderForm } from "./order-form";

export default async function NewOrderPage() {
  const { supabase, companyId, branch } = await requireBranch();
  const [suppliers, products, taxRates] = await Promise.all([
    getSuppliers(supabase, companyId),
    getOrderProductOptions(supabase, companyId, branch.id),
    getTaxRates(supabase, companyId),
  ]);
  const gstRate = Number(taxRates.find((rate) => rate.is_default)?.rate_percentage ?? 9);

  return (
    <div className="space-y-6">
      <div>
        <Link href="/stock-in" className="text-sm text-muted underline">
          Back to stock-in
        </Link>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">New stock-in</h1>
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
          <Link href="/admin/products" className="underline">
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
          products={products}
        />
      )}
    </div>
  );
}
