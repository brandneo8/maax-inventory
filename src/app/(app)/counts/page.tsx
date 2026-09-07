import Link from "next/link";
import { requireBranch } from "@/lib/auth";
import { getInventoryCounts } from "@/lib/data/counts";
import { formatDate } from "@/lib/format";
import { classificationLabel } from "@/lib/labels";
import { btnClass, tableClass, tdClass, thClass } from "@/lib/ui";

export default async function CountsPage() {
  const { supabase, companyId, branch } = await requireBranch();
  const counts = await getInventoryCounts(supabase, companyId, branch.id);

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Inventory counts</h1>
          <p className="mt-1 text-sm text-muted">
            Working in {branch.displayName}. Scope a session by location, brand, type, or tag.
            Completing it writes ledger adjustments for this salon only.
          </p>
        </div>
        <Link className={btnClass} href="/counts/new">
          New count
        </Link>
      </div>

      <div className="overflow-x-auto rounded-xl border border-border bg-card">
        <table className={tableClass}>
          <thead>
            <tr>
              <th className={thClass}>Date</th>
              <th className={thClass}>Scope</th>
              <th className={thClass}>Counted by</th>
              <th className={thClass}>Status</th>
            </tr>
          </thead>
          <tbody>
            {counts.length === 0 ? (
              <tr>
                <td className={tdClass} colSpan={4}>
                  No counts yet.
                </td>
              </tr>
            ) : (
              counts.map((count) => {
                const location = Array.isArray(count.store_locations)
                  ? count.store_locations[0]
                  : count.store_locations;
                const brand = Array.isArray(count.brands) ? count.brands[0] : count.brands;
                const tag = Array.isArray(count.tags) ? count.tags[0] : count.tags;
                const scope = [
                  location?.name ?? "Whole branch",
                  brand?.name,
                  classificationLabel(count.filter_classification),
                  tag?.name,
                ]
                  .filter((part) => part && part !== "—")
                  .join(" · ");

                return (
                  <tr key={count.id}>
                    <td className={tdClass}>
                      <Link className="underline" href={`/counts/${count.id}`}>
                        {formatDate(count.count_date)}
                      </Link>
                    </td>
                    <td className={tdClass}>{scope}</td>
                    <td className={tdClass}>{count.counted_by ?? "—"}</td>
                    <td className={tdClass}>{count.status.replace("_", " ")}</td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
