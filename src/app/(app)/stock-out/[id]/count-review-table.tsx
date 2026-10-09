"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { setStockOutLineCovered } from "../actions";
import type { StockOutCountReviewRow } from "@/lib/data/stock-out";
import { formatDate, formatQty } from "@/lib/format";
import { tableClass, tdClass, thClass } from "@/lib/ui";
import { cn } from "@/lib/utils";

/**
 * Stock-out lines opened on or before the latest confirmed count. The count
 * may already have caught that use as a shortfall: the user decides per line
 * whether it's covered by the count (so stock isn't reduced twice) or is an
 * extra deduction on top of what was counted.
 */
export function CountReviewTable({
  latestCountDate,
  rows,
}: {
  latestCountDate: string;
  rows: StockOutCountReviewRow[];
}) {
  const router = useRouter();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function choose(row: StockOutCountReviewRow, covered: boolean) {
    if (covered === row.coveredQuantity > 0 || busyId) return;
    setBusyId(row.entryId);
    setError(null);
    try {
      const result = await setStockOutLineCovered(row.entryId, covered);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      router.refresh();
    } catch {
      setError("Could not reach the server. Check your connection and try again.");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <section className="space-y-3">
      <div>
        <h2 className="text-lg font-semibold">Opened on or before the latest count</h2>
        <p className="mt-1 max-w-3xl text-sm text-muted">
          These lines are dated on or before the count confirmed on {formatDate(latestCountDate)}. If the count already
          showed these units as missing, mark the line <strong>Covered by count</strong> so stock isn&apos;t reduced
          twice. Otherwise leave it as an <strong>Extra deduction</strong>.
        </p>
      </div>

      {error ? (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p>
      ) : null}

      <div className="overflow-x-auto rounded-xl border border-border bg-card">
        <table className={tableClass}>
          <thead>
            <tr>
              <th className={thClass}>Product</th>
              <th className={thClass}>Open date</th>
              <th className={cn(thClass, "text-right")}>Quantity</th>
              <th className={thClass}>Count</th>
              <th className={cn(thClass, "text-right")}>Count deduction</th>
              <th className={thClass}>Treat as</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const covered = row.coveredQuantity > 0;
              const canCover = !row.isBundle && Boolean(row.shortfallTxnId) && row.coverable > 0;
              const busy = busyId === row.entryId;
              return (
                <tr key={row.entryId} className={cn(covered && "bg-sky-50/60", busy && "opacity-60")}>
                  <td className={tdClass}>
                    {row.label}
                    {row.sku ? <span className="block text-xs text-muted">{row.sku}</span> : null}
                  </td>
                  <td className={cn(tdClass, "whitespace-nowrap")}>{formatDate(row.openDate)}</td>
                  <td className={cn(tdClass, "text-right tabular-nums")}>{formatQty(row.quantity)}</td>
                  <td className={cn(tdClass, "whitespace-nowrap")}>
                    {row.countId ? (
                      <Link className="text-sky-700 underline" href={`/counts/${row.countId}`} target="_blank">
                        {row.countDate ? formatDate(row.countDate) : "Count"}
                      </Link>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className={cn(tdClass, "text-right tabular-nums")}>
                    {row.isBundle ? (
                      <span className="text-muted">Bundle — n/a</span>
                    ) : row.shortfallTxnId ? (
                      formatQty(row.coverable)
                    ) : (
                      <span className="text-muted">No shortfall</span>
                    )}
                  </td>
                  <td className={tdClass}>
                    <div
                      className="inline-flex overflow-hidden rounded-lg border border-border text-xs"
                      role="group"
                      aria-label={`Treatment for ${row.label}`}
                    >
                      <button
                        type="button"
                        aria-pressed={!covered}
                        className={cn(
                          "px-2.5 py-1.5 whitespace-nowrap",
                          !covered ? "bg-slate-900 font-medium text-white" : "bg-white hover:bg-slate-50",
                        )}
                        onClick={() => void choose(row, false)}
                        disabled={busy}
                      >
                        Extra deduction
                      </button>
                      <button
                        type="button"
                        aria-pressed={covered}
                        className={cn(
                          "border-l border-border px-2.5 py-1.5 whitespace-nowrap",
                          covered ? "bg-sky-700 font-medium text-white" : "bg-white hover:bg-slate-50",
                          !canCover && !covered && "cursor-not-allowed text-muted",
                        )}
                        onClick={() => void choose(row, true)}
                        disabled={busy || (!canCover && !covered)}
                        title={
                          row.isBundle
                            ? "Bundle lines can't be covered by a count."
                            : !row.shortfallTxnId
                              ? "That count didn't find this product short."
                              : undefined
                        }
                      >
                        Covered by count
                      </button>
                    </div>
                    {covered && row.coveredQuantity < row.quantity ? (
                      <span className="mt-1 block text-xs text-muted">
                        {formatQty(row.coveredQuantity)} covered, {formatQty(row.quantity - row.coveredQuantity)} extra
                      </span>
                    ) : null}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
