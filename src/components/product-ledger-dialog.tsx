"use client";

import { useEffect, useState } from "react";
import { getProductLedgerAction } from "@/app/(app)/product-panel-actions";
import type { ProductLedgerRow } from "@/lib/data/stock";
import { formatDateTime, formatQty } from "@/lib/format";
import { movementTypeLabel } from "@/lib/labels";
import { btnSecondaryClass, tableClass, tdClass, thClass } from "@/lib/ui";
import { cn } from "@/lib/utils";

export type LedgerDialogProduct = { id: string; label: string; sku: string | null; onHand: number };

/**
 * One product's in/out history at the current salon, under its on-hand
 * balance — what the Products panel and Home open for auditing a balance.
 * Loads the ledger when it mounts; give it a `key` of the product id so a
 * different product starts fresh.
 */
export function ProductLedgerDialog({
  product,
  branchName,
  onClose,
}: {
  product: LedgerDialogProduct;
  branchName: string;
  onClose: () => void;
}) {
  const [ledger, setLedger] = useState<ProductLedgerRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    getProductLedgerAction(product.id)
      .then((rows) => {
        if (!cancelled) setLedger(rows);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Could not load this product's ledger.");
      });
    return () => {
      cancelled = true;
    };
  }, [product.id]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="product-ledger-title"
        className="w-full max-w-3xl rounded-xl border border-border bg-white p-4 shadow-lg"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 id="product-ledger-title" className="text-lg font-semibold">
              {product.label}
            </h2>
            <p className="text-sm text-muted">{product.sku || "—"}</p>
          </div>
          <button className={btnSecondaryClass} type="button" onClick={onClose}>
            Close
          </button>
        </div>

        <div className="mt-3 max-h-[28rem] overflow-y-auto rounded-lg border border-border">
          {error ? (
            <p className="p-4 text-sm text-red-800">{error}</p>
          ) : ledger === null ? (
            <p className="p-4 text-sm text-muted">Loading…</p>
          ) : ledger.length === 0 ? (
            <p className="p-4 text-sm text-muted">No movements recorded for this product yet.</p>
          ) : (
            <table className={tableClass}>
              <thead>
                <tr>
                  <th className={thClass}>Date</th>
                  <th className={thClass}>Type</th>
                  <th className={thClass}>Qty change</th>
                  <th className={cn(thClass, "whitespace-nowrap")}>Reference</th>
                  <th className={thClass}>Notes</th>
                </tr>
              </thead>
              <tbody>
                {/* The balance the movements below add up to, newest first. */}
                <tr className="bg-slate-50">
                  <td className={cn(tdClass, "font-semibold")} colSpan={2}>
                    On hand now at {branchName}
                  </td>
                  <td
                    className={cn(
                      tdClass,
                      "text-2xl font-semibold tabular-nums",
                      product.onHand < 0 && "text-red-700",
                    )}
                  >
                    {formatQty(product.onHand)}
                  </td>
                  <td className={cn(tdClass, "text-muted")} colSpan={2}>
                    Total of all the changes below
                  </td>
                </tr>
                {ledger.map((row) => (
                  <tr key={row.id}>
                    <td className={cn(tdClass, "whitespace-nowrap")}>{formatDateTime(row.txnDate)}</td>
                    <td className={tdClass}>{movementTypeLabel(row.txnType)}</td>
                    <td className={cn(tdClass, row.quantityChange < 0 ? "text-red-600" : "text-emerald-600")}>
                      {row.quantityChange > 0 ? `+${formatQty(row.quantityChange)}` : formatQty(row.quantityChange)}
                    </td>
                    <td className={cn(tdClass, "whitespace-nowrap")}>
                      {row.reference ? (
                        row.reference.href ? (
                          <a className="text-blue-600 underline" href={row.reference.href}>
                            {row.reference.label}
                          </a>
                        ) : (
                          row.reference.label
                        )
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className={tdClass}>{row.notes || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
