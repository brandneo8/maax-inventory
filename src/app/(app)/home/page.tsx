import { requireBranch } from "@/lib/auth";
import { getProducts, getStoreLocations } from "@/lib/data/lookups";
import { getRecentRetailUse, getRetailExportRows } from "@/lib/data/retail";
import { formatDate, formatQty, formatSku, productLabel } from "@/lib/format";
import { btnClass, tableClass, tdClass, thClass, workingIn } from "@/lib/ui";
import { ImportForms } from "../import/import-forms";

export default async function HomePage() {
  const { supabase, companyId, branch } = await requireBranch();
  const [products, locations, recent, exportRows] = await Promise.all([
    getProducts(supabase, companyId),
    getStoreLocations(supabase, companyId),
    getRecentRetailUse(supabase, companyId, branch.id),
    getRetailExportRows(supabase, companyId, branch.id),
  ]);
  const branchLocations = locations.filter((location) => location.branch_id === branch.id);

  return (
    <div className="space-y-10">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Home</h1>
        <p className="mt-1 text-sm text-muted">
          {workingIn(branch.displayName)} Import retail-use from the external sales system, or
          export on-hand retail stock for this salon only.
        </p>
      </div>

      <section className="space-y-4">
        <div>
          <h2 className="text-lg font-semibold">Import</h2>
          <p className="mt-1 text-sm text-muted">
            Key in the retail-use report, or upload it as CSV. Each line reduces on-hand stock.
          </p>
        </div>

        {products.length === 0 ? (
          <p className="rounded-xl border border-border bg-card p-4 text-sm text-muted">
            Add products first, then import usage against them.
          </p>
        ) : branchLocations.length === 0 ? (
          <p className="rounded-xl border border-border bg-card p-4 text-sm text-muted">
            This branch has no store locations.
          </p>
        ) : (
          <ImportForms
            key={branch.id}
            branchId={branch.id}
            branchName={branch.displayName}
            products={products.map((product) => ({
              id: product.id,
              label: productLabel(product),
            }))}
          />
        )}

        <div className="space-y-3">
          <h3 className="text-sm font-semibold">Recent imports</h3>
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
                    const entryBranch = Array.isArray(entry.branches) ? entry.branches[0] : entry.branches;
                    const location = Array.isArray(entry.store_locations)
                      ? entry.store_locations[0]
                      : entry.store_locations;
                    return (
                      <tr key={entry.id}>
                        <td className={tdClass}>{formatDate(entry.entry_date)}</td>
                        <td className={tdClass}>
                          {productLabel(product)}
                        </td>
                        <td className={tdClass}>{entryBranch?.name ?? "—"}</td>
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
        </div>
      </section>

      <section className="space-y-4">
        <div className="flex items-end justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold">Export</h2>
            <p className="mt-1 text-sm text-muted">
              Retail product stock to hand off to the external sales system. This is a file export,
              not an API sync.
            </p>
          </div>
          {exportRows.length > 0 ? (
            <a className={btnClass} href="/export/retail">
              Download CSV
            </a>
          ) : null}
        </div>

        <div className="overflow-x-auto rounded-xl border border-border bg-card">
          <table className={tableClass}>
            <thead>
              <tr>
                <th className={thClass}>SKU</th>
                <th className={thClass}>Product</th>
                <th className={thClass}>Brand</th>
                <th className={thClass}>Type</th>
                <th className={thClass}>Branch</th>
                <th className={thClass}>On hand</th>
              </tr>
            </thead>
            <tbody>
              {exportRows.length === 0 ? (
                <tr>
                  <td className={tdClass} colSpan={6}>
                    No retail products to export yet. Add products typed as retail, or receive them
                    on an order.
                  </td>
                </tr>
              ) : (
                exportRows.map((row, index) => (
                  <tr key={`${row.sku}-${row.branch}-${index}`}>
                    <td className={tdClass}>{formatSku(row.sku)}</td>
                    <td className={tdClass}>{row.name}</td>
                    <td className={tdClass}>{row.brand || "—"}</td>
                    <td className={tdClass}>{row.classification || "—"}</td>
                    <td className={tdClass}>{row.branch || "—"}</td>
                    <td className={tdClass}>{formatQty(row.quantity_on_hand)}</td>
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
