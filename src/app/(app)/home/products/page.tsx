import Link from "next/link";
import { requireBranch } from "@/lib/auth";
import { getOrderBalanceProducts } from "@/lib/data/products";
import { ProductBalanceTable } from "./product-balance-table";

export default async function HomeProductsPage() {
  const { supabase, companyId, branch } = await requireBranch();
  const products = await getOrderBalanceProducts(supabase, companyId, branch.id);

  return (
    <div className="space-y-6">
      <div>
        <Link href="/home" className="text-sm text-muted underline">
          Back to Home
        </Link>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">Products</h1>
        <p className="mt-1 text-sm text-muted">
          Every product with inventory at {branch.displayName}. Click a row to see its ledger — every
          addition, deduction, and count adjustment behind the current balance.
        </p>
      </div>

      <ProductBalanceTable
        products={products.map((product) => ({
          id: product.id,
          name: product.name,
          orderName: product.orderName,
          sku: product.sku,
          barcode: product.barcode,
          brand: product.brand,
          onHand: product.onHand,
        }))}
      />
    </div>
  );
}
