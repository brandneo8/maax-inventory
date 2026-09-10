import { requireBranch } from "@/lib/auth";
import { getProducts } from "@/lib/data/lookups";
import { getCurrentStock, getRecentMovements } from "@/lib/data/stock";
import { formatDate, formatMoney, formatQty, formatSku, productDisplayName, productLabel } from "@/lib/format";
import { tableClass, tdClass, thClass } from "@/lib/ui";

export default async function ReportsPage() {
  const { supabase, companyId, branch } = await requireBranch();
  const [stock, products, recent] = await Promise.all([
    getCurrentStock(supabase),
    getProducts(supabase, companyId),
    getRecentMovements(supabase, companyId, branch.id),
  ]);
  const branchStock = stock.filter((row) => row.branch_id === branch.id);
  const qtyByProduct = new Map<string, number>();
  const salonStockMap = new Map<
    string,
    { productId: string; sku: string | undefined; name: string | undefined; quantity: number }
  >();
  for (const row of branchStock) {
    if (!row.product_id) continue;
    const quantity = Number(row.quantity_on_hand);
    qtyByProduct.set(row.product_id, (qtyByProduct.get(row.product_id) ?? 0) + quantity);
    const current = salonStockMap.get(row.product_id);
    if (current) {
      current.quantity += quantity;
    } else {
      salonStockMap.set(row.product_id, {
        productId: row.product_id,
        sku: row.sku ?? undefined,
        name: row.name ?? undefined,
        quantity,
      });
    }
  }
  const salonStock = [...salonStockMap.values()].filter((row) => row.quantity > 0);
  const lowStock = products.filter((product) => {
    if (product.low_stock_threshold == null) return false;
    return (qtyByProduct.get(product.id) ?? 0) <= Number(product.low_stock_threshold);
  });

  return (
    <div className="space-y-10">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Reports</h1>
        <p className="mt-1 text-sm text-muted">
          Working in {branch.displayName}. On-hand stock and movements are for this salon only.
        </p>
      </div>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Low stock</h2>
        <div className="overflow-x-auto rounded-xl border border-border bg-card">
          <table className={tableClass}>
            <thead>
              <tr>
                <th className={thClass}>SKU</th>
                <th className={thClass}>Product</th>
                <th className={thClass}>On hand</th>
                <th className={thClass}>Threshold</th>
              </tr>
            </thead>
            <tbody>
              {lowStock.length === 0 ? (
                <tr>
                  <td className={tdClass} colSpan={4}>
                    No products are at or below their threshold.
                  </td>
                </tr>
              ) : (
                lowStock.map((row) => (
                  <tr key={row.id}>
                    <td className={tdClass}>{formatSku(row.sku)}</td>
                    <td className={tdClass}>{productDisplayName(row)}</td>
                    <td className={tdClass}>{formatQty(qtyByProduct.get(row.id) ?? 0)}</td>
                    <td className={tdClass}>{formatQty(row.low_stock_threshold)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">On-hand stock</h2>
        <div className="overflow-x-auto rounded-xl border border-border bg-card">
          <table className={tableClass}>
            <thead>
              <tr>
                <th className={thClass}>SKU</th>
                <th className={thClass}>Product</th>
                <th className={thClass}>Qty</th>
              </tr>
            </thead>
            <tbody>
              {salonStock.length === 0 ? (
                <tr>
                  <td className={tdClass} colSpan={3}>
                    No stock on hand at this branch yet.
                  </td>
                </tr>
              ) : (
                salonStock.map((row) => (
                  <tr key={row.productId}>
                    <td className={tdClass}>{formatSku(row.sku)}</td>
                    <td className={tdClass}>{row.name}</td>
                    <td className={tdClass}>{formatQty(row.quantity)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Recent movements and costing</h2>
        <div className="overflow-x-auto rounded-xl border border-border bg-card">
          <table className={tableClass}>
            <thead>
              <tr>
                <th className={thClass}>Date</th>
                <th className={thClass}>Product</th>
                <th className={thClass}>Type</th>
                <th className={thClass}>Qty</th>
                <th className={thClass}>Unit cost</th>
                <th className={thClass}>Value</th>
              </tr>
            </thead>
            <tbody>
              {recent.length === 0 ? (
                <tr>
                  <td className={tdClass} colSpan={6}>
                    No ledger movements yet.
                  </td>
                </tr>
              ) : (
                recent.map((row) => (
                  <tr key={row.id}>
                    <td className={tdClass}>{formatDate(row.txn_date)}</td>
                    <td className={tdClass}>{productLabel({ sku: row.sku, name: row.name })}</td>
                    <td className={tdClass}>{row.txn_type.replace("_", " ")}</td>
                    <td className={tdClass}>{formatQty(row.quantity_change)}</td>
                    <td className={tdClass}>
                      {row.unit_cost === undefined ? "—" : formatMoney(row.unit_cost)}
                    </td>
                    <td className={tdClass}>
                      {row.movement_value === null ? "—" : formatMoney(row.movement_value)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
