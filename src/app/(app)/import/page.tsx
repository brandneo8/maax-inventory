import { requireBranch } from "@/lib/auth";
import { getProducts, getStoreLocations } from "@/lib/data/lookups";
import { getRecentRetailUse } from "@/lib/data/retail";
import { formatDate, formatQty } from "@/lib/format";
import { tableClass, tdClass, thClass } from "@/lib/ui";
import { ImportForms } from "./import-forms";

export default async function ImportPage() {
  const { supabase, companyId, branch } = await requireBranch();
  const [products, locations, recent] = await Promise.all([
    getProducts(supabase, companyId),
    getStoreLocations(supabase, companyId),
    getRecentRetailUse(supabase, companyId, branch.id),
  ]);
  const branchLocations = locations.filter((location) => location.branch_id === branch.id);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Import</h1>
        <p className="mt-1 text-sm text-muted">
          Key in the retail-use report from the external sales system, or upload it as CSV.
          Each line reduces on-hand stock.
        </p>
      </div>

      {products.length === 0 ? (
        <p className="rounded-xl border border-border bg-card p-4 text-sm text-muted">
          Add products first, then import usage against them.
        </p>
      ) : (
        <ImportForms
          branchId={branch.id}
          products={products.map((product) => ({
            id: product.id,
            label: `${product.sku} — ${product.name}`,
          }))}
          locations={branchLocations.map((location) => ({
            id: location.id,
            label: location.name,
          }))}
        />
      )}

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Recent imports</h2>
        <div className="overflow-x-auto rounded-xl border border-border bg-card">
          <table className={tableClass}>
            <thead>
              <tr>
                <th className={thClass}>Date</th>
                <th className={thClass}>Product</th>
                <th className={thClass}>Branch</th>
                <th className={thClass}>Location</th>
                <th className={thClass}>Qty used</th>
                <th className={thClass}>Reference</th>
              </tr>
            </thead>
            <tbody>
              {recent.length === 0 ? (
                <tr>
                  <td className={tdClass} colSpan={6}>
                    No retail-use entries yet.
                  </td>
                </tr>
              ) : (
                recent.map((entry) => {
                  const product = Array.isArray(entry.products) ? entry.products[0] : entry.products;
                  const branch = Array.isArray(entry.branches) ? entry.branches[0] : entry.branches;
                  const location = Array.isArray(entry.store_locations)
                    ? entry.store_locations[0]
                    : entry.store_locations;
                  return (
                    <tr key={entry.id}>
                      <td className={tdClass}>{formatDate(entry.entry_date)}</td>
                      <td className={tdClass}>
                        {product ? `${product.sku} — ${product.name}` : "—"}
                      </td>
                      <td className={tdClass}>{branch?.name ?? "—"}</td>
                      <td className={tdClass}>{location?.name ?? "—"}</td>
                      <td className={tdClass}>{formatQty(entry.quantity_used)}</td>
                      <td className={tdClass}>{entry.external_reference ?? "—"}</td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
