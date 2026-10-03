"use client";

import { useMemo, useState } from "react";
import { ProductLedgerDialog, type LedgerDialogProduct } from "@/components/product-ledger-dialog";
import { formatMoney, formatMonthLabel, formatQty } from "@/lib/format";
import { CLASSIFICATIONS, type ProductClassification } from "@/lib/labels";
import { btnSecondaryClass, fieldClass, tableClass, tdClass, thClass } from "@/lib/ui";
import { cn } from "@/lib/utils";
import { MonthRangePicker } from "./month-range-picker";

export type HomeProduct = {
  id: string;
  label: string;
  sku: string | null;
  brand: string;
  /** This salon's types for the product (retail, in-house, GWP…). */
  classifications: ProductClassification[];
  onHand: number;
  /** Use, sales and cost below cover the months chosen in the fastest-moving table. */
  monthToDateUse: number;
  monthToDateCost: number;
  monthToDateSales: number;
  isBundle: boolean;
};

const PAGE_SIZE = 10;

/** Home's two audit tables, side by side: negative balances, and the month's fastest movers. */
export function HomeTables({
  products,
  branchName,
  from,
  to,
  currentMonth,
}: {
  products: HomeProduct[];
  branchName: string;
  from: string;
  to: string;
  currentMonth: string;
}) {
  const [ledgerProduct, setLedgerProduct] = useState<LedgerDialogProduct | null>(null);

  const negatives = useMemo(
    () => products.filter((product) => product.onHand < 0).sort((left, right) => left.onHand - right.onHand),
    [products],
  );

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <NegativeBalances products={negatives} onOpen={setLedgerProduct} />
      <FastestMoving products={products} from={from} to={to} currentMonth={currentMonth} onOpen={setLedgerProduct} />
      {ledgerProduct ? (
        <ProductLedgerDialog
          key={ledgerProduct.id}
          product={ledgerProduct}
          branchName={branchName}
          onClose={() => setLedgerProduct(null)}
        />
      ) : null}
    </div>
  );
}

/** One page of rows, clamped so a shrinking list never leaves you on an empty page. */
function usePage<T>(rows: T[]) {
  const [page, setPage] = useState(0);
  const pageCount = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const current = Math.min(page, pageCount - 1);
  return {
    rows: rows.slice(current * PAGE_SIZE, (current + 1) * PAGE_SIZE),
    page: current,
    pageCount,
    total: rows.length,
    setPage,
  };
}

function Pager({
  page,
  pageCount,
  total,
  setPage,
}: {
  page: number;
  pageCount: number;
  total: number;
  setPage: (page: number) => void;
}) {
  if (pageCount <= 1) return null;
  return (
    <div className="flex items-center justify-end gap-3 text-sm">
      <span className="text-muted tabular-nums">
        {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, total)} of {total}
      </span>
      <button
        type="button"
        className={cn(btnSecondaryClass, "px-3 py-1 text-xs")}
        onClick={() => setPage(page - 1)}
        disabled={page === 0}
      >
        Previous
      </button>
      <button
        type="button"
        className={cn(btnSecondaryClass, "px-3 py-1 text-xs")}
        onClick={() => setPage(page + 1)}
        disabled={page >= pageCount - 1}
      >
        Next
      </button>
    </div>
  );
}

function ProductCell({ product, onOpen }: { product: HomeProduct; onOpen: (product: LedgerDialogProduct) => void }) {
  return (
    <td className={tdClass}>
      <button
        type="button"
        className="text-left text-sky-700 underline underline-offset-2 hover:text-sky-900"
        onClick={() => onOpen(product)}
        title="Open in/out history"
      >
        {product.label}
      </button>
      <span className="block text-xs text-muted">{[product.brand, product.sku].filter(Boolean).join(" · ") || "—"}</span>
    </td>
  );
}

function NegativeBalances({
  products,
  onOpen,
}: {
  products: HomeProduct[];
  onOpen: (product: LedgerDialogProduct) => void;
}) {
  const paged = usePage(products);

  return (
    <section className="flex min-w-0 flex-col gap-2">
      <div>
        <h3 className="text-lg font-semibold">
          Negative inventory balance <span className="font-normal text-muted">({products.length})</span>
        </h3>
        <p className="text-sm text-muted">More went out than came in. Open a product to audit its history.</p>
      </div>
      <div className="overflow-x-auto rounded-xl border border-border bg-card">
        <table className={tableClass}>
          <thead>
            <tr>
              <th className={thClass}>Product</th>
              <th className={cn(thClass, "text-right")}>On hand</th>
            </tr>
          </thead>
          <tbody>
            {products.length === 0 ? (
              <tr>
                <td className={cn(tdClass, "text-muted")} colSpan={2}>
                  No products are below zero.
                </td>
              </tr>
            ) : (
              paged.rows.map((product) => (
                <tr key={product.id}>
                  <ProductCell product={product} onOpen={onOpen} />
                  <td className={cn(tdClass, "text-right font-semibold tabular-nums text-red-700")}>
                    {formatQty(product.onHand)}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      <Pager {...paged} />
    </section>
  );
}

function FastestMoving({
  products,
  from,
  to,
  currentMonth,
  onOpen,
}: {
  products: HomeProduct[];
  from: string;
  to: string;
  currentMonth: string;
  onOpen: (product: LedgerDialogProduct) => void;
}) {
  const [types, setTypes] = useState<ProductClassification[]>([]);
  const [brand, setBrand] = useState("");
  const period = from === to ? formatMonthLabel(from) : `${formatMonthLabel(from)} to ${formatMonthLabel(to)}`;

  // Bundles aren't used themselves (their components are), so they're left out.
  const movers = useMemo(() => products.filter((product) => !product.isBundle && product.monthToDateUse > 0), [products]);
  const typeOptions = useMemo(
    () => CLASSIFICATIONS.filter((item) => movers.some((product) => product.classifications.includes(item.value))),
    [movers],
  );

  function toggleType(type: ProductClassification) {
    setTypes((current) => (current.includes(type) ? current.filter((value) => value !== type) : [...current, type]));
  }
  const brandOptions = useMemo(
    () => [...new Set(movers.map((product) => product.brand).filter(Boolean))].sort((a, b) => a.localeCompare(b)),
    [movers],
  );
  const rows = useMemo(
    () =>
      movers
        .filter(
          (product) =>
            (types.length === 0 || product.classifications.some((type) => types.includes(type))) &&
            (!brand || product.brand === brand),
        )
        .sort((left, right) => right.monthToDateUse - left.monthToDateUse || left.label.localeCompare(right.label)),
    [movers, types, brand],
  );
  const paged = usePage(rows);

  return (
    <section className="flex min-w-0 flex-col gap-2">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h3 className="text-lg font-semibold">Fastest moving products</h3>
          <p className="text-sm text-muted">
            Highest use in {period}
            {to === currentMonth ? " (this month so far)" : ""}.
          </p>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <MonthRangePicker
            from={from}
            to={to}
            maxMonth={currentMonth}
            fromParam="pfrom"
            toParam="pto"
            idPrefix="home-fastest"
          />
          <select
            id="home-fastest-brand"
            className={cn(fieldClass, "w-auto py-1.5 text-sm")}
            value={brand}
            onChange={(event) => setBrand(event.target.value)}
            aria-label="Filter by brand"
          >
            <option value="">All brands</option>
            {brandOptions.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </div>
      </div>
      {typeOptions.length > 0 ? (
        <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Filter by type">
          <span className="text-sm text-muted">Type:</span>
          {typeOptions.map((item) => {
            const selected = types.includes(item.value);
            return (
              <button
                key={item.value}
                type="button"
                aria-pressed={selected}
                className={cn(
                  "rounded-full border px-3 py-1 text-sm hover:bg-slate-50",
                  selected ? "border-sky-400 bg-sky-100 font-medium text-sky-900" : "border-border",
                )}
                onClick={() => toggleType(item.value)}
              >
                {item.label}
              </button>
            );
          })}
          {types.length > 0 ? (
            <button type="button" className="text-sm text-muted underline" onClick={() => setTypes([])}>
              All types
            </button>
          ) : null}
        </div>
      ) : null}
      <div className="overflow-x-auto rounded-xl border border-border bg-card">
        <table className={tableClass}>
          <thead>
            <tr>
              <th className={thClass}>Product</th>
              <th className={cn(thClass, "text-right")}>Used</th>
              <th className={cn(thClass, "text-right")}>Sales</th>
              <th className={cn(thClass, "text-right")}>Cost</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td className={cn(tdClass, "text-muted")} colSpan={4}>
                  {movers.length === 0 ? `Nothing used in ${period}.` : "No products match these filters."}
                </td>
              </tr>
            ) : (
              paged.rows.map((product) => (
                <tr key={product.id}>
                  <ProductCell product={product} onOpen={onOpen} />
                  <td className={cn(tdClass, "text-right font-semibold tabular-nums")}>
                    {formatQty(product.monthToDateUse)}
                  </td>
                  <td className={cn(tdClass, "text-right tabular-nums")}>
                    {product.monthToDateSales ? formatMoney(product.monthToDateSales) : "—"}
                  </td>
                  <td className={cn(tdClass, "text-right tabular-nums")}>{formatMoney(product.monthToDateCost)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      <Pager {...paged} />
      <p className="text-xs text-muted">
        Sales: confirmed product sales in the period. Cost: the stock value that use took out.
      </p>
    </section>
  );
}
