import Link from "next/link";
import { requireBranch } from "@/lib/auth";
import { getInventoryMovements, MOVEMENT_PAGE_SIZE } from "@/lib/data/movements";
import { formatDateTime, formatMoney, formatQty } from "@/lib/format";
import { classificationLabel, movementTypeLabel, type ProductClassification } from "@/lib/labels";
import { btnClass, btnSecondaryClass, fieldClass, tableClass, tdClass, thClass, workingIn } from "@/lib/ui";
import { cn } from "@/lib/utils";

const TXN_TYPES = ["goods_receipt", "retail_use", "count_adjustment", "transfer", "waste", "gwp_use", "initial_stock"];

export default async function MovementPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; type?: string; from?: string; to?: string; page?: string }>;
}) {
  const { supabase, companyId, branch } = await requireBranch();
  const params = await searchParams;
  const page = Math.max(0, Number(params.page ?? "0") || 0);

  const filters = {
    query: params.q,
    txnType: params.type,
    dateFrom: params.from,
    dateTo: params.to,
  };

  const { rows, total } = await getInventoryMovements(supabase, companyId, branch.id, filters, page);
  const pageCount = Math.max(1, Math.ceil(total / MOVEMENT_PAGE_SIZE));
  const currentPage = Math.min(page, pageCount - 1);

  function pageHref(nextPage: number) {
    const search = new URLSearchParams();
    if (params.q) search.set("q", params.q);
    if (params.type) search.set("type", params.type);
    if (params.from) search.set("from", params.from);
    if (params.to) search.set("to", params.to);
    if (nextPage > 0) search.set("page", String(nextPage));
    const qs = search.toString();
    return qs ? `/movement?${qs}` : "/movement";
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Movements</h1>
        <p className="mt-1 text-sm text-muted">
          {workingIn(branch.displayName)}. Every stock-moving ledger entry for this salon — receipts, counts,
          usage, and anything else that changed on-hand quantity or cost.
        </p>
      </div>

      <form className="grid gap-3 rounded-xl border border-border bg-card p-4 md:grid-cols-[minmax(0,1.4fr)_10rem_9rem_9rem_auto]">
        <label className="space-y-1 text-sm">
          <span>Search product</span>
          <input className={fieldClass} type="text" name="q" defaultValue={params.q ?? ""} placeholder="Name, order name, or SKU" />
        </label>
        <label className="space-y-1 text-sm">
          <span>Type</span>
          <select className={fieldClass} name="type" defaultValue={params.type ?? ""}>
            <option value="">All types</option>
            {TXN_TYPES.map((type) => (
              <option key={type} value={type}>
                {movementTypeLabel(type)}
              </option>
            ))}
          </select>
        </label>
        <label className="space-y-1 text-sm">
          <span>From</span>
          <input className={fieldClass} type="date" name="from" defaultValue={params.from ?? ""} />
        </label>
        <label className="space-y-1 text-sm">
          <span>To</span>
          <input className={fieldClass} type="date" name="to" defaultValue={params.to ?? ""} />
        </label>
        <div className="flex items-end gap-2">
          <button className={btnClass} type="submit">
            Filter
          </button>
          <Link className={btnSecondaryClass} href="/movement">
            Clear
          </Link>
        </div>
      </form>

      <div className="overflow-x-auto rounded-xl border border-border bg-card">
        <table className={tableClass}>
          <thead>
            <tr>
              <th className={thClass}>Date</th>
              <th className={thClass}>Product</th>
              <th className={thClass}>Type</th>
              <th className={cn(thClass, "text-right")}>Qty</th>
              <th className={cn(thClass, "text-right")}>Unit cost</th>
              <th className={cn(thClass, "text-right")}>Value</th>
              <th className={thClass}>Reference</th>
              <th className={thClass}>Notes</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td className={tdClass} colSpan={8}>
                  No movements match these filters.
                </td>
              </tr>
            ) : (
              rows.map((row) => {
                const value = row.unitCost == null ? null : row.unitCost * row.quantityChange;
                return (
                  <tr key={row.id}>
                    <td className={tdClass}>{formatDateTime(row.txnDate)}</td>
                    <td className={tdClass}>
                      <span className="block">{row.productName}</span>
                      <span className="block text-xs text-muted">
                        {[row.sku, row.sizeLabel].filter(Boolean).join(" · ") || "—"}
                      </span>
                    </td>
                    <td className={tdClass}>
                      {movementTypeLabel(row.txnType)}
                      {row.classification ? (
                        <span className="block text-xs text-muted">
                          {classificationLabel(row.classification as ProductClassification)}
                        </span>
                      ) : null}
                    </td>
                    <td className={cn(tdClass, "text-right", row.quantityChange < 0 ? "text-red-600" : "text-emerald-700")}>
                      {row.quantityChange > 0 ? "+" : ""}
                      {formatQty(row.quantityChange)}
                    </td>
                    <td className={cn(tdClass, "text-right")}>{row.unitCost == null ? "—" : formatMoney(row.unitCost)}</td>
                    <td className={cn(tdClass, "text-right")}>{value == null ? "—" : formatMoney(value)}</td>
                    <td className={tdClass}>
                      {row.reference?.href ? (
                        <Link className="underline" href={row.reference.href}>
                          {row.reference.label}
                        </Link>
                      ) : (
                        (row.reference?.label ?? "—")
                      )}
                      <span className="block text-xs text-muted">{row.locationName ?? "—"}</span>
                    </td>
                    <td className={tdClass}>{row.notes ?? "—"}</td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {pageCount > 1 ? (
        <div className="flex items-center justify-between gap-4">
          <span className="text-sm text-muted">
            Page {currentPage + 1} of {pageCount} ({total} movements)
          </span>
          <div className="flex gap-2">
            <Link
              className={cn(btnSecondaryClass, currentPage <= 0 && "pointer-events-none opacity-40")}
              href={pageHref(currentPage - 1)}
            >
              Previous
            </Link>
            <Link
              className={cn(btnSecondaryClass, currentPage >= pageCount - 1 && "pointer-events-none opacity-40")}
              href={pageHref(currentPage + 1)}
            >
              Next
            </Link>
          </div>
        </div>
      ) : null}
    </div>
  );
}
