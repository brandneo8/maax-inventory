"use client";

import { useEffect, useMemo, useState } from "react";
import { ChevronLeft, Package, RefreshCw, X } from "lucide-react";
import { getProductBalancesAction, getProductLedgerAction } from "@/app/(app)/product-panel-actions";
import type { ProductBalance } from "@/lib/data/products";
import type { ProductLedgerRow } from "@/lib/data/stock";
import { formatDateTime, formatQty } from "@/lib/format";
import { movementTypeLabel } from "@/lib/labels";
import { searchFieldsMatch } from "@/lib/search";
import { btnSecondaryClass, fieldClass, tableClass, tdClass, thClass } from "@/lib/ui";
import { cn } from "@/lib/utils";

/**
 * A right-hand panel, available on every page, for looking up any product
 * at the current salon: search by name, SKU or barcode, see its on-hand
 * balance, and click it for the full ledger behind that balance. Products
 * load each time the panel opens, so the balances are current.
 */
export function ProductsPanel({ branchName }: { branchName: string }) {
  const [open, setOpen] = useState(false);
  const [products, setProducts] = useState<ProductBalance[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  const [ledgerProduct, setLedgerProduct] = useState<ProductBalance | null>(null);
  const [ledger, setLedger] = useState<ProductLedgerRow[] | null>(null);
  const [ledgerLoading, setLedgerLoading] = useState(false);
  const [ledgerError, setLedgerError] = useState<string | null>(null);

  async function loadProducts() {
    setLoading(true);
    setError(null);
    try {
      setProducts(await getProductBalancesAction());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load products.");
    } finally {
      setLoading(false);
    }
  }

  function openPanel() {
    setOpen(true);
    void loadProducts();
  }

  async function openLedger(product: ProductBalance) {
    setLedgerProduct(product);
    setLedger(null);
    setLedgerError(null);
    setLedgerLoading(true);
    try {
      setLedger(await getProductLedgerAction(product.id));
    } catch (err) {
      setLedgerError(err instanceof Error ? err.message : "Could not load this product's ledger.");
    } finally {
      setLedgerLoading(false);
    }
  }

  function closeLedger() {
    setLedgerProduct(null);
    setLedger(null);
    setLedgerError(null);
  }

  // Escape closes the ledger popup first, then the panel.
  useEffect(() => {
    if (!open) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      if (ledgerProduct) closeLedger();
      else setOpen(false);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, ledgerProduct]);

  const matches = useMemo(() => {
    const needle = query.trim();
    if (!products) return [];
    if (!needle) return products;
    return products.filter((product) =>
      searchFieldsMatch(
        [product.label, product.orderName, product.sku, product.barcode, product.brand, product.sizeLabel],
        needle,
      ),
    );
  }, [products, query]);

  return (
    <>
      {open ? null : (
        <button
          type="button"
          onClick={openPanel}
          className="fixed top-4 right-4 z-30 flex items-center gap-2 rounded-lg border border-border bg-white px-4 py-2.5 text-sm font-medium text-slate-800 shadow-md hover:bg-slate-50"
          aria-label="Open products panel"
          title="Products"
        >
          <ChevronLeft className="size-5" aria-hidden />
          <Package className="size-5" aria-hidden />
          <span>Products</span>
        </button>
      )}

      {open ? (
        <aside
          className="fixed top-0 right-0 z-40 flex h-dvh w-full flex-col border-l border-border bg-white shadow-xl sm:w-[26rem]"
          aria-label="Products"
        >
          <div className="flex items-start justify-between gap-3 border-b border-border p-4">
            <div>
              <h2 className="text-lg font-semibold">Products</h2>
              <p className="text-xs text-muted">
                On hand at {branchName}. Click a product for its in/out history.
              </p>
            </div>
            <div className="flex gap-1">
              <button
                type="button"
                className={cn(btnSecondaryClass, "px-2")}
                onClick={() => void loadProducts()}
                disabled={loading}
                aria-label="Refresh"
                title="Refresh"
              >
                <RefreshCw className={cn("size-4", loading && "animate-spin")} aria-hidden />
              </button>
              <button
                type="button"
                className={cn(btnSecondaryClass, "px-2")}
                onClick={() => setOpen(false)}
                aria-label="Close products panel"
                title="Close"
              >
                <X className="size-4" aria-hidden />
              </button>
            </div>
          </div>

          <div className="border-b border-border p-3">
            <input
              className={fieldClass}
              placeholder="Search by name, SKU, or barcode"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              autoFocus
              autoComplete="off"
              spellCheck={false}
            />
            {products ? (
              <p className="mt-1.5 text-xs text-muted">
                {matches.length} of {products.length} product{products.length === 1 ? "" : "s"}
              </p>
            ) : null}
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto">
            {error ? (
              <p className="m-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p>
            ) : products === null ? (
              <p className="p-4 text-sm text-muted">Loading products…</p>
            ) : matches.length === 0 ? (
              <p className="p-4 text-sm text-muted">
                {products.length === 0 ? "No products are assigned to this salon yet." : "No products match."}
              </p>
            ) : (
              <ul className="divide-y divide-border">
                {matches.map((product) => (
                  <li key={product.id}>
                    <button
                      type="button"
                      className="flex w-full items-start justify-between gap-3 px-4 py-2.5 text-left hover:bg-slate-50"
                      onClick={() => void openLedger(product)}
                    >
                      <span className="min-w-0">
                        <span className="block text-sm">
                          {product.label}
                          {product.sizeLabel ? (
                            <span className="ml-1.5 text-xs text-muted">({product.sizeLabel})</span>
                          ) : null}
                        </span>
                        <span className="block truncate text-xs text-muted">
                          {[product.brand, product.sku, product.barcode].filter(Boolean).join(" · ") || "—"}
                        </span>
                      </span>
                      <span
                        className={cn(
                          "shrink-0 text-sm font-medium tabular-nums",
                          product.onHand < 0 ? "text-red-700" : product.onHand === 0 ? "text-muted" : "text-slate-900",
                        )}
                      >
                        {formatQty(product.onHand)}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </aside>
      ) : null}

      {ledgerProduct ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={closeLedger}>
          <div
            className="w-full max-w-3xl rounded-xl border border-border bg-white p-4 shadow-lg"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold">{ledgerProduct.label}</h2>
                <p className="text-sm text-muted">{ledgerProduct.sku || "—"}</p>
              </div>
              <button className={btnSecondaryClass} type="button" onClick={closeLedger}>
                Close
              </button>
            </div>

            <div className="mt-3 max-h-[28rem] overflow-y-auto rounded-lg border border-border">
              {ledgerLoading ? (
                <p className="p-4 text-sm text-muted">Loading…</p>
              ) : ledgerError ? (
                <p className="p-4 text-sm text-red-800">{ledgerError}</p>
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
                    {/* The balance the movements below add up to, newest first. */}
                    <tr className="bg-slate-50">
                      <td className={cn(tdClass, "font-semibold")} colSpan={2}>
                        On hand now at {branchName}
                      </td>
                      <td className={cn(tdClass, "text-2xl font-semibold tabular-nums")}>
                        {formatQty(ledgerProduct.onHand)}
                      </td>
                      <td className={cn(tdClass, "text-muted")} colSpan={2}>
                        Total of all the changes below
                      </td>
                    </tr>
                    {(ledger ?? []).map((row) => (
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
      ) : null}
    </>
  );
}
