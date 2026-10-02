import Link from "next/link";
import { requireBranch } from "@/lib/auth";
import { getProductSales } from "@/lib/data/product-sales";
import { formatDate, formatMoney, formatQty } from "@/lib/format";
import { btnClass, btnSecondaryClass, tableClass, tdClass, thClass } from "@/lib/ui";
import { cn } from "@/lib/utils";
import { DeleteProductSaleButton } from "./delete-product-sale-button";

export default async function ProductSalesPage() {
  const { supabase, companyId, branch } = await requireBranch();
  const sales = await getProductSales(supabase, companyId, branch.id);

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Product sales</h1>
          <p className="mt-1 text-sm text-muted">
            Working in {branch.displayName}. Record product sales from the POS system — each entry deducts the
            products sold from stock.
          </p>
        </div>
        <Link className={btnClass} href="/product-sales/new">
          New product sale
        </Link>
      </div>

      <div className="overflow-x-auto rounded-xl border border-border bg-card">
        <table className={tableClass}>
          <thead>
            <tr>
              <th className={thClass}>Report date</th>
              <th className={thClass}>Status</th>
              <th className={thClass}>Lines</th>
              <th className={cn(thClass, "text-right")}>Total quantity</th>
              <th className={cn(thClass, "text-right")}>Total sales</th>
              <th className={thClass}>Keyed in by</th>
              <th className={thClass} />
            </tr>
          </thead>
          <tbody>
            {sales.length === 0 ? (
              <tr>
                <td className={tdClass} colSpan={7}>
                  No product sales recorded yet.
                </td>
              </tr>
            ) : (
              sales.map((sale) => (
                <tr key={sale.id}>
                  <td className={tdClass}>
                    <Link className="underline" href={`/product-sales/${sale.id}`}>
                      {formatDate(sale.sale_date)}
                    </Link>
                  </td>
                  <td className={tdClass}>
                    {sale.status === "draft" ? (
                      <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">Draft</span>
                    ) : (
                      <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-800">
                        Confirmed
                      </span>
                    )}
                  </td>
                  <td className={tdClass}>{sale.lineCount}</td>
                  <td className={cn(tdClass, "text-right text-red-600")}>{formatQty(sale.totalQuantity)}</td>
                  <td className={cn(tdClass, "text-right")}>{formatMoney(sale.totalSales)}</td>
                  <td className={tdClass}>{sale.keyed_in_by || "—"}</td>
                  <td className={tdClass}>
                    <div className="flex justify-end gap-2">
                      <Link
                        className={cn(btnSecondaryClass, "px-2 py-1 text-xs")}
                        href={`/product-sales/new?from=${sale.id}`}
                      >
                        Duplicate
                      </Link>
                      <DeleteProductSaleButton saleId={sale.id} compact />
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
