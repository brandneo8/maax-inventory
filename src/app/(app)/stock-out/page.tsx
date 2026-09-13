import Link from "next/link";
import { requireBranch } from "@/lib/auth";
import { getStockOutReports } from "@/lib/data/stock-out";
import { formatDate, formatQty } from "@/lib/format";
import { btnClass, tableClass, tdClass, thClass } from "@/lib/ui";
import { cn } from "@/lib/utils";
import { DeleteStockOutButton } from "./delete-stock-out-button";

const TYPE_LABELS: Record<string, string> = {
  retail: "Retail use",
  inhouse: "Inhouse use",
};

export default async function StockOutPage() {
  const { supabase, companyId, branch } = await requireBranch();
  const reports = await getStockOutReports(supabase, companyId, branch.id);

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Stock-out</h1>
          <p className="mt-1 text-sm text-muted">
            Working in {branch.displayName}. Deduct product used in the salon from stock.
          </p>
        </div>
        <Link className={btnClass} href="/stock-out/new">
          New stock-out
        </Link>
      </div>

      <div className="overflow-x-auto rounded-xl border border-border bg-card">
        <table className={tableClass}>
          <thead>
            <tr>
              <th className={thClass}>Entry date</th>
              <th className={thClass}>Type</th>
              <th className={thClass}>Lines</th>
              <th className={thClass}>Total quantity</th>
              <th className={thClass}>Keyed in by</th>
            </tr>
          </thead>
          <tbody>
            {reports.length === 0 ? (
              <tr>
                <td className={tdClass} colSpan={5}>
                  No stock-outs recorded yet.
                </td>
              </tr>
            ) : (
              reports.map((report) => (
                <tr key={report.id}>
                  <td className={tdClass}>
                    <Link className="underline" href={`/stock-out/${report.id}`}>
                      {formatDate(report.entry_date)}
                    </Link>
                  </td>
                  <td className={tdClass}>{TYPE_LABELS[report.channel] ?? report.channel}</td>
                  <td className={tdClass}>{report.lineCount}</td>
                  <td className={cn(tdClass, "text-red-600")}>{formatQty(report.totalQuantity)}</td>
                  <td className={tdClass}>{report.keyed_in_by || "—"}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
