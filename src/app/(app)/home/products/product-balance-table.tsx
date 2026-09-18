"use client";

import { useState } from "react";
import { getProductLedgerAction } from "./actions";
import type { ProductLedgerRow } from "@/lib/data/stock";
import { formatDateTime, formatQty, productDisplayName } from "@/lib/format";
import { movementTypeLabel } from "@/lib/labels";
import { btnSecondaryClass, tableClass, tdClass, thClass } from "@/lib/ui";
import { cn } from "@/lib/utils";

type BalanceProduct = {
  id: string;
  name: string;
  orderName: string;
  sku: string | null;
  barcode: string | null;
  brand: string;
  onHand: number;
};

export function ProductBalanceTable({ products }: { products: BalanceProduct[] }) {
  const [openProduct, setOpenProduct] = useState<BalanceProduct | null>(null);
  const [ledger, setLedger] = useState<ProductLedgerRow[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function openLedger(product: BalanceProduct) {
    setOpenProduct(product);
    setLedger(null);
    setError(null);
    setLoading(true);
    try {
      const rows = await getProductLedgerAction(product.id);
      setLedger(rows);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load this product's ledger.");
    } finally {
      setLoading(false);
    }
  }

  function close() {
    setOpenProduct(null);
    setLedger(null);
    setError(null);
  }

  return (
    <>
      <div className="overflow-x-auto rounded-xl border border-border bg-card">
        <table className={tableClass}>
          <thead>
            <tr>
              <th className={thClass}>Name</th>
              <th className={thClass}>SKU</th>
              <th className={thClass}>Brand</th>
              <th className={thClass}>On hand</th>
            </tr>
          </thead>
          <tbody>
            {products.length === 0 ? (
              <tr>
                <td className={tdClass} colSpan={4}>
                  No products have inventory here yet.
                </td>
              </tr>
            ) : (
              products.map((product) => (
                <tr
                  key={product.id}
                  className="cursor-pointer hover:bg-slate-50"
                  onClick={() => void openLedger(product)}
                >
                  <td className={tdClass}>{productDisplayName(product) || product.sku || "—"}</td>
                  <td className={tdClass}>{product.sku || "—"}</td>
                  <td className={tdClass}>{product.brand || "—"}</td>
                  <td className={tdClass}>{formatQty(product.onHand)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {openProduct ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-3xl rounded-xl border border-border bg-white p-4 shadow-lg">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold">
                  {productDisplayName(openProduct) || openProduct.sku || "—"}
                </h2>
                <p className="text-sm text-muted">{openProduct.sku || "—"} · On hand {formatQty(openProduct.onHand)}</p>
              </div>
              <button className={btnSecondaryClass} type="button" onClick={close}>
                Close
              </button>
            </div>

            <div className="mt-3 max-h-[28rem] overflow-y-auto rounded-lg border border-border">
              {loading ? (
                <p className="p-4 text-sm text-muted">Loading…</p>
              ) : error ? (
                <p className="p-4 text-sm text-red-800">{error}</p>
              ) : ledger && ledger.length === 0 ? (
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
                    {(ledger ?? []).map((row) => (
                      <tr key={row.id}>
                        <td className={tdClass}>{formatDateTime(row.txnDate)}</td>
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
      ) : null}
    </>
  );
}
