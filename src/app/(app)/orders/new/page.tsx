import Link from "next/link";
import { requireBranch } from "@/lib/auth";
import { getProducts, getSuppliers } from "@/lib/data/lookups";
import { OrderForm } from "./order-form";

export default async function NewOrderPage() {
  const { supabase, companyId, branch } = await requireBranch();
  const [suppliers, products] = await Promise.all([
    getSuppliers(supabase, companyId),
    getProducts(supabase, companyId),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <Link href="/orders" className="text-sm text-muted underline">
          Back to orders
        </Link>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">New purchase order</h1>
        <p className="mt-1 text-sm text-muted">
          Classification is set on each line. Stock is not added until the order is received.
        </p>
      </div>

      {suppliers.length === 0 || products.length === 0 ? (
        <p className="rounded-xl border border-border bg-card p-4 text-sm text-muted">
          Add at least one{" "}
          <Link href="/admin" className="underline">
            supplier
          </Link>{" "}
          and one{" "}
          <Link href="/products" className="underline">
            product
          </Link>{" "}
          before creating an order.
        </p>
      ) : (
        <OrderForm
          branchId={branch.id}
          suppliers={suppliers.map((supplier) => ({
            id: supplier.id,
            label: supplier.supplier_name,
          }))}
          products={products.map((product) => ({
            id: product.id,
            label: `${product.sku} — ${product.name}`,
            defaultClassification: product.default_classification,
            unitCost: Number(product.unit_cost_price),
          }))}
        />
      )}
    </div>
  );
}
