import { requireBranch } from "@/lib/auth";
import { getRetailExportRows } from "@/lib/data/retail";
import { formatQty } from "@/lib/format";
import { btnClass, tableClass, tdClass, thClass } from "@/lib/ui";

export default async function ExportPage() {
  const { supabase, companyId, branch } = await requireBranch();
  const rows = await getRetailExportRows(supabase, companyId, branch.id);

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Export</h1>
          <p className="mt-1 text-sm text-muted">
            Retail product stock to hand off to the external sales system. This is a file export, not
            an API sync.
          </p>
        </div>
        {rows.length > 0 ? (
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
              <th className={thClass}>Location</th>
              <th className={thClass}>On hand</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td className={tdClass} colSpan={7}>
                  No retail products to export yet. Add products typed as retail, or receive them on
                  an order.
                </td>
              </tr>
            ) : (
              rows.map((row, index) => (
                <tr key={`${row.sku}-${row.branch}-${row.location}-${index}`}>
                  <td className={tdClass}>{row.sku}</td>
                  <td className={tdClass}>{row.name}</td>
                  <td className={tdClass}>{row.brand || "—"}</td>
                  <td className={tdClass}>{row.classification || "—"}</td>
                  <td className={tdClass}>{row.branch || "—"}</td>
                  <td className={tdClass}>{row.location || "—"}</td>
                  <td className={tdClass}>{formatQty(row.quantity_on_hand)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
