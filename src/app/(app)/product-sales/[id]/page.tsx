import Link from "next/link";
import { notFound } from "next/navigation";
import { requireBranch } from "@/lib/auth";
import { getProductSale } from "@/lib/data/product-sales";
import { formatDate, formatDateTime, formatMoney, formatQty, formatSku, productDisplayName } from "@/lib/format";
import { btnSecondaryClass, tableClass, tdClass, thClass } from "@/lib/ui";
import { cn } from "@/lib/utils";
import { DeleteProductSaleButton } from "../delete-product-sale-button";

export default async function ProductSaleDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase, companyId, branch } = await requireBranch();
  const sale = await getProductSale(supabase, companyId, branch.id, id).catch(() => null);
  if (!sale) notFound();

  const items = sale.items.map((item) => {
    const product = Array.isArray(item.products) ? item.products[0] : item.products;
    return {
      id: item.id,
      label: productDisplayName(product) || "—",
      sku: product?.sku ?? null,
      sizeLabel: product?.size_label ?? null,
      dateSold: item.sale_date,
      quantity: Number(item.quantity),
      unitCost: item.unitCost,
      unitSalePrice: Number(item.unit_sale_price),
      totalCost: item.unitCost * Number(item.quantity),
      totalSales: Number(item.line_total),
      applied: item.linkedCount?.applied ?? 0,
      linkedCount: item.linkedCount,
    };
  });
  const totalQuantity = items.reduce((sum, item) => sum + item.quantity, 0);
  const totalApplied = items.reduce((sum, item) => sum + item.applied, 0);
  const totalCost = items.reduce((sum, item) => sum + item.totalCost, 0);
  const totalSales = items.reduce((sum, item) => sum + item.totalSales, 0);

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between gap-4">
        <div>
          <Link href="/product-sales" className="text-sm text-muted underline">
            ← Back to Product sales
          </Link>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight">Product sale · {formatDate(sale.sale_date)}</h1>
          <p className="mt-1 text-sm text-muted">
            {branch.displayName} · keyed in by {sale.keyed_in_by || "—"} on {formatDateTime(sale.created_at)}
          </p>
          {sale.notes ? <p className="mt-1 text-sm text-slate-700">{sale.notes}</p> : null}
        </div>
        <div className="flex gap-2">
          <Link className={btnSecondaryClass} href={`/product-sales/new?from=${sale.id}`}>
            Duplicate
          </Link>
          <DeleteProductSaleButton saleId={sale.id} />
        </div>
      </div>

      <div className="overflow-x-auto rounded-xl border border-border bg-card">
        <table className={tableClass}>
          <thead>
            <tr>
              <th className={thClass}>Product</th>
              <th className={thClass}>SKU</th>
              <th className={thClass}>Date sold</th>
              <th className={cn(thClass, "text-right")}>Quantity sold</th>
              <th className={cn(thClass, "text-right")}>Applied to inventory count</th>
              <th className={cn(thClass, "text-right")}>Unit cost</th>
              <th className={cn(thClass, "text-right")}>Unit price</th>
              <th className={cn(thClass, "text-right")}>Total cost</th>
              <th className={cn(thClass, "text-right")}>Total sales</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.id}>
                <td className={tdClass}>
                  {item.label}
                  {item.sizeLabel ? <span className="ml-1.5 text-xs text-muted">({item.sizeLabel})</span> : null}
                </td>
                <td className={tdClass}>{formatSku(item.sku)}</td>
                <td className={cn(tdClass, "whitespace-nowrap")}>{formatDate(item.dateSold)}</td>
                <td className={cn(tdClass, "text-right text-red-600")}>{formatQty(item.quantity)}</td>
                <td className={cn(tdClass, "text-right")}>
                  {item.linkedCount ? (
                    <>
                      <span className="text-sky-800">{formatQty(item.applied)}</span>
                      <span className="block text-xs text-muted">
                        {item.linkedCount.countId ? (
                          <Link className="text-sky-700 underline" href={`/counts/${item.linkedCount.countId}`}>
                            Count {formatDate(item.linkedCount.countDate)}
                          </Link>
                        ) : (
                          "Count"
                        )}{" "}
                        (−{formatQty(item.linkedCount.shortfall)})
                      </span>
                    </>
                  ) : (
                    <span className="text-muted">—</span>
                  )}
                </td>
                <td
                  className={cn(tdClass, "text-right", item.unitCost === 0 ? "text-amber-700" : "text-muted")}
                  title={item.unitCost === 0 ? "No cost was recorded at this salon for this product — booked at $0 cost." : undefined}
                >
                  {formatMoney(item.unitCost)}
                  {item.unitCost === 0 ? <span className="block text-xs">No cost at this salon</span> : null}
                </td>
                <td className={cn(tdClass, "text-right")}>{formatMoney(item.unitSalePrice)}</td>
                <td className={cn(tdClass, "text-right")}>{formatMoney(item.totalCost)}</td>
                <td className={cn(tdClass, "text-right")}>{formatMoney(item.totalSales)}</td>
              </tr>
            ))}
            <tr className="font-semibold">
              <td className={tdClass} colSpan={3}>
                Total
              </td>
              <td className={cn(tdClass, "text-right")}>{formatQty(totalQuantity)}</td>
              <td className={cn(tdClass, "text-right")}>{totalApplied > 0 ? formatQty(totalApplied) : "—"}</td>
              <td className={tdClass} />
              <td className={tdClass} />
              <td className={cn(tdClass, "text-right")}>{formatMoney(totalCost)}</td>
              <td className={cn(tdClass, "text-right")}>{formatMoney(totalSales)}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}
