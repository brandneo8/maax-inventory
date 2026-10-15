import Link from "next/link";
import { requireBranch } from "@/lib/auth";
import { getLatestPostedCountDate } from "@/lib/data/counts";
import { getSuppliers, getTaxRates } from "@/lib/data/lookups";
import { getOrderProductOptions } from "@/lib/data/products";
import { StockInForm } from "../stock-in-form";

export default async function NewStockInPage() {
  const { supabase, companyId, branch } = await requireBranch();
  const [suppliers, products, taxRates, latestCountDate] = await Promise.all([
    getSuppliers(supabase, companyId),
    getOrderProductOptions(supabase, companyId, branch.id),
    getTaxRates(supabase, companyId),
    getLatestPostedCountDate(supabase, companyId, branch.id),
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
          Working in {branch.displayName}. Add what arrived, confirm the quantities, then the prices, invoice and FX,
          and receive it into stock. Save it as a draft to finish later.
        </p>
      </div>

      {suppliers.length === 0 || products.length === 0 ? (
        <p className="rounded-xl border border-border bg-card p-4 text-sm text-muted">
          Add at least one{" "}
          <Link href="/admin/suppliers" className="underline">
            supplier
          </Link>{" "}
          and one{" "}
          <Link href="/admin/products" className="underline">
            product
          </Link>{" "}
          before receiving stock.
        </p>
      ) : (
        <StockInForm
          key={branch.id}
          branchName={branch.displayName}
          gstRate={gstRate}
          latestCountDate={latestCountDate}
          suppliers={suppliers
            .filter((supplier) => supplier.is_active)
            .map((supplier) => ({
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
