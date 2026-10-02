"use client";

import { useEffect, useMemo, useState } from "react";
import { Trash2 } from "lucide-react";
import { getLinkableCountShortfalls, saveProductSale } from "../actions";
import { ProductPicker } from "@/components/product-picker";
import type { CountShortfall } from "@/lib/data/product-sales";
import type { PosSaleProductOption } from "@/lib/data/products";
import { formatDate, formatMoney, formatQty } from "@/lib/format";
import {
  blurOnWheel,
  btnClass,
  btnSecondaryClass,
  checkboxClass,
  fieldClass,
  numberFieldClass,
  tableClass,
  tdClass,
  thClass,
} from "@/lib/ui";
import { cn } from "@/lib/utils";

type SaleLine = {
  key: string;
  productId: string;
  quantity: number;
  unitSalePrice: number;
  saleDate: string;
  linkedTxnId: string | null;
  linkedQuantity: number;
};

function clampDate(date: string, maxDate: string) {
  if (!date) return maxDate;
  return date > maxDate ? maxDate : date;
}

const NO_COST_HINT = "No cost recorded at this salon yet — this line will be booked at $0 cost.";
const stickyHead = "sticky top-0 z-10 bg-card";

function toQuantity(raw: string) {
  const parsed = Math.round(Number(raw));
  return Number.isFinite(parsed) ? Math.max(0, parsed) : 0;
}

function toPrice(raw: string) {
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? Math.max(0, parsed) : 0;
}

function AddSaleLine({
  products,
  maxDate,
  onAdd,
}: {
  products: PosSaleProductOption[];
  maxDate: string;
  onAdd: (productId: string, quantity: number, unitSalePrice: number, saleDate: string) => void;
}) {
  const [productId, setProductId] = useState("");
  const [quantity, setQuantity] = useState(1);
  const [priceText, setPriceText] = useState("");
  const [dateText, setDateText] = useState<string | null>(null);
  const selected = products.find((product) => product.id === productId);
  // Follows the sale date until the user picks a different day for this line.
  const lineDate = clampDate(dateText ?? maxDate, maxDate);

  const canAdd = Boolean(productId) && quantity > 0 && priceText.trim() !== "";

  function handleAdd() {
    if (!canAdd) return;
    onAdd(productId, quantity, toPrice(priceText), lineDate);
    setProductId("");
    setQuantity(1);
    setPriceText("");
  }

  return (
    <div className="flex flex-wrap items-end gap-2 rounded-xl border border-border bg-card p-3">
      <label className="min-w-64 flex-1 space-y-1 text-sm">
        <span>Search product</span>
        <ProductPicker products={products} value={productId} onSelect={(product) => setProductId(product.id)} />
      </label>
      <label className="w-40 space-y-1 text-sm">
        <span>Date sold</span>
        <input
          className={fieldClass}
          type="date"
          max={maxDate}
          value={lineDate}
          onChange={(event) => setDateText(event.target.value)}
        />
      </label>
      <label className="w-28 space-y-1 text-sm">
        <span>Quantity</span>
        <input
          className={cn(fieldClass, numberFieldClass)}
          type="number"
          min="1"
          step="1"
          value={quantity === 0 ? "" : quantity}
          onWheel={blurOnWheel}
          onChange={(event) => setQuantity(toQuantity(event.target.value))}
        />
      </label>
      <div className="w-28 space-y-1 text-sm">
        <span>Unit cost</span>
        <p
          className={cn(
            "rounded-lg border px-3 py-2 text-right",
            selected && selected.costPrice === 0
              ? "border-amber-300 bg-amber-50 text-amber-800"
              : "border-border bg-slate-50 text-muted",
          )}
          title={selected && selected.costPrice === 0 ? NO_COST_HINT : undefined}
        >
          {selected ? formatMoney(selected.costPrice) : "—"}
        </p>
      </div>
      <label className="w-36 space-y-1 text-sm">
        <span>Unit price</span>
        <input
          className={cn(fieldClass, numberFieldClass)}
          type="number"
          min="0"
          step="0.01"
          placeholder="0.00"
          value={priceText}
          onWheel={blurOnWheel}
          onChange={(event) => setPriceText(event.target.value)}
        />
      </label>
      <button className={btnClass} type="button" onClick={handleAdd} disabled={!canAdd}>
        Add
      </button>
    </div>
  );
}

export function NewProductSaleForm({
  branchId,
  branchName,
  products,
  today,
  saleId = null,
  initialSaleDate,
  initialNotes = "",
  initialLines = [],
}: {
  branchId: string;
  branchName: string;
  products: PosSaleProductOption[];
  today: string;
  /** Set when reopening a saved draft — saving then updates it instead of creating a new sale. */
  saleId?: string | null;
  initialSaleDate?: string;
  initialNotes?: string;
  initialLines?: (Omit<SaleLine, "linkedTxnId" | "linkedQuantity" | "saleDate"> &
    Partial<Pick<SaleLine, "linkedTxnId" | "linkedQuantity" | "saleDate">>)[];
}) {
  const [saleDate, setSaleDate] = useState(() => clampDate(initialSaleDate ?? today, today));
  const [notes, setNotes] = useState(initialNotes);
  const [lines, setLines] = useState<SaleLine[]>(() =>
    initialLines.map((line) => ({
      ...line,
      saleDate: clampDate(line.saleDate ?? initialSaleDate ?? today, initialSaleDate ?? today),
      linkedTxnId: line.linkedTxnId ?? null,
      linkedQuantity: line.linkedTxnId ? (line.linkedQuantity ?? 0) : 0,
    })),
  );
  const [countRows, setCountRows] = useState<CountShortfall[] | null>(null);
  const [onlyThisSale, setOnlyThisSale] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<"draft" | "confirm" | null>(null);

  useEffect(() => {
    let cancelled = false;
    getLinkableCountShortfalls()
      .then((rows) => {
        if (!cancelled) setCountRows(rows);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Could not load inventory count reductions.");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const productById = useMemo(() => new Map(products.map((product) => [product.id, product])), [products]);
  const countRowById = useMemo(() => new Map((countRows ?? []).map((row) => [row.txnId, row])), [countRows]);

  function saleQuantityFor(productId: string) {
    return lines.filter((line) => line.productId === productId).reduce((sum, line) => sum + line.quantity, 0);
  }
  function appliedTo(txnId: string) {
    return lines
      .filter((line) => line.linkedTxnId === txnId)
      .reduce((sum, line) => sum + line.linkedQuantity, 0);
  }

  /** Sale lines for this product that aren't already applied to another count reduction. */
  function unappliedLines(productId: string) {
    return lines.filter(
      (line) => line.productId === productId && !line.linkedTxnId && !productById.get(productId)?.isBundle,
    );
  }

  function apply(row: CountShortfall) {
    let available = row.remaining - appliedTo(row.txnId);
    const toLink = new Map<string, number>();
    for (const line of unappliedLines(row.productId)) {
      if (available <= 0) break;
      const quantity = Math.min(line.quantity, available);
      if (quantity <= 0) continue;
      toLink.set(line.key, quantity);
      available -= quantity;
    }
    if (toLink.size === 0) return;
    setLines(
      lines.map((line) =>
        toLink.has(line.key)
          ? { ...line, linkedTxnId: row.txnId, linkedQuantity: toLink.get(line.key) as number }
          : line,
      ),
    );
  }

  function undo(txnId: string) {
    setLines(
      lines.map((line) => (line.linkedTxnId === txnId ? { ...line, linkedTxnId: null, linkedQuantity: 0 } : line)),
    );
  }

  function addLine(productId: string, quantity: number, unitSalePrice: number, lineDate: string) {
    const existing = lines.find(
      (line) =>
        line.productId === productId &&
        line.unitSalePrice === unitSalePrice &&
        line.saleDate === lineDate &&
        !line.linkedTxnId,
    );
    if (existing) {
      setLines(lines.map((line) => (line === existing ? { ...line, quantity: line.quantity + quantity } : line)));
      return;
    }
    setLines([
      ...lines,
      {
        key: crypto.randomUUID(),
        productId,
        quantity,
        unitSalePrice,
        saleDate: lineDate,
        linkedTxnId: null,
        linkedQuantity: 0,
      },
    ]);
  }

  // Lines can't be dated after the sale, so moving the sale date earlier
  // pulls any later line back with it.
  function changeSaleDate(next: string) {
    const date = clampDate(next, today);
    setSaleDate(date);
    setLines((current) => current.map((line) => ({ ...line, saleDate: clampDate(line.saleDate, date) })));
  }

  function updateLineDate(key: string, date: string) {
    setLines(lines.map((line) => (line.key === key ? { ...line, saleDate: clampDate(date, saleDate) } : line)));
  }

  /** An applied line dated after its count: those units would show as on hand between the two dates. */
  function soldAfterCount(line: SaleLine) {
    const countDate = line.linkedTxnId ? countRowById.get(line.linkedTxnId)?.countDate : null;
    return countDate && line.saleDate > countDate ? countDate : null;
  }

  function updateQuantity(key: string, quantity: number) {
    setLines(
      lines.map((line) => {
        if (line.key !== key) return line;
        // An applied amount can never be more than the line itself sells.
        const linkedQuantity = Math.min(line.linkedQuantity, quantity);
        return linkedQuantity > 0
          ? { ...line, quantity, linkedQuantity }
          : { ...line, quantity, linkedTxnId: null, linkedQuantity: 0 };
      }),
    );
  }

  function updatePrice(key: string, unitSalePrice: number) {
    setLines(lines.map((line) => (line.key === key ? { ...line, unitSalePrice } : line)));
  }

  const productsOnSale = new Set(lines.map((line) => line.productId));
  const visibleCountRows = (countRows ?? [])
    .filter((row) => !onlyThisSale || productsOnSale.has(row.productId))
    .sort((left, right) => {
      const onSale = Number(productsOnSale.has(right.productId)) - Number(productsOnSale.has(left.productId));
      if (onSale !== 0) return onSale;
      const byName = left.productLabel.localeCompare(right.productLabel, undefined, { sensitivity: "base" });
      if (byName !== 0) return byName;
      return (right.countDate ?? "").localeCompare(left.countDate ?? "");
    });

  // What this sale will actually do to stock, per stock-holding product. An
  // applied unit was already taken out by its count, so only the unapplied
  // part of a line is a reduction here; a bundle reduces its components.
  const balanceRows = (() => {
    const byProduct = new Map<
      string,
      { productId: string; label: string; sku: string | null; starting: number; reduction: number; applied: number; viaBundle: Set<string> }
    >();
    function add(
      productId: string,
      details: { label: string; sku: string | null; starting: number },
      reduction: number,
      applied: number,
      bundleLabel?: string,
    ) {
      const row = byProduct.get(productId) ?? { productId, ...details, reduction: 0, applied: 0, viaBundle: new Set<string>() };
      row.reduction += reduction;
      row.applied += applied;
      if (bundleLabel) row.viaBundle.add(bundleLabel);
      byProduct.set(productId, row);
    }
    for (const line of lines) {
      const product = productById.get(line.productId);
      if (!product) continue;
      if (product.isBundle) {
        for (const component of product.components) {
          add(
            component.productId,
            { label: component.label, sku: null, starting: component.onHand },
            line.quantity * component.quantity,
            0,
            product.label,
          );
        }
        continue;
      }
      const applied = line.linkedTxnId ? line.linkedQuantity : 0;
      add(product.id, { label: product.label, sku: product.sku, starting: product.onHand }, line.quantity - applied, applied);
    }
    return [...byProduct.values()].sort((left, right) =>
      left.label.localeCompare(right.label, undefined, { sensitivity: "base" }),
    );
  })();
  const hasNegativeClosing = balanceRows.some((row) => row.starting - row.reduction < 0);

  const totalQuantity = lines.reduce((sum, line) => sum + line.quantity, 0);
  const totalSales = lines.reduce((sum, line) => sum + line.quantity * line.unitSalePrice, 0);
  const hasZeroCostLine = lines.some((line) => productById.get(line.productId)?.costPrice === 0);

  async function save(confirm: boolean) {
    setPending(confirm ? "confirm" : "draft");
    setError(null);
    try {
      await saveProductSale({
        sale_id: saleId,
        confirm,
        branch_id: branchId,
        sale_date: saleDate,
        notes,
        lines: lines.map((line) => ({
          product_id: line.productId,
          quantity: line.quantity,
          unit_sale_price: line.unitSalePrice,
          sale_date: line.saleDate,
          linked_count_txn_id: line.linkedTxnId,
          linked_quantity: line.linkedTxnId ? line.linkedQuantity : null,
        })),
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save this product sale.");
      setPending(null);
    }
  }

  const cannotSave = pending !== null || lines.length === 0 || lines.some((line) => line.quantity <= 0);

  return (
    <form onSubmit={(event) => event.preventDefault()} className="space-y-6">
      {error ? (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p>
      ) : null}

      <div className="grid gap-3 rounded-xl border border-border bg-card p-4 md:grid-cols-2">
        <label className="space-y-1 text-sm">
          <span>Report date</span>
          <input
            className={fieldClass}
            type="date"
            max={today}
            value={saleDate}
            onChange={(event) => changeSaleDate(event.target.value)}
            required
          />
        </label>
        <label className="space-y-1 text-sm">
          <span>Notes (optional)</span>
          <input
            className={fieldClass}
            placeholder="e.g. POS report reference"
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
          />
        </label>
      </div>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Products sold</h2>
        <AddSaleLine products={products} maxDate={saleDate} onAdd={addLine} />
        {lines.length === 0 ? (
          <p className="rounded-xl border border-dashed border-border bg-card p-4 text-sm text-muted">
            Search for a product above, enter the quantity and unit price, then add it.
          </p>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-border bg-card">
            <table className={tableClass}>
              <thead>
                <tr>
                  <th className={thClass}>Product</th>
                  <th className={cn(thClass, "w-40")}>Date sold</th>
                  <th className={cn(thClass, "w-28 text-right")}>Quantity</th>
                  <th className={cn(thClass, "text-right")}>Unit cost</th>
                  <th className={cn(thClass, "w-36 text-right")}>Unit price</th>
                  <th className={cn(thClass, "text-right")}>Line total</th>
                  <th className={thClass} />
                </tr>
              </thead>
              <tbody>
                {lines.map((line) => {
                  const product = productById.get(line.productId);
                  const label = product?.label ?? "Unknown product";
                  const linkedRow = line.linkedTxnId ? countRowById.get(line.linkedTxnId) : undefined;
                  return (
                    <tr key={line.key}>
                      <td className={tdClass}>
                        {label}
                        {product?.sizeLabel ? (
                          <span className="ml-1.5 text-xs text-muted">({product.sizeLabel})</span>
                        ) : null}
                        {product?.sku ? <span className="block text-xs text-muted">{product.sku}</span> : null}
                        {line.linkedTxnId ? (
                          <span className="mt-0.5 block text-xs text-sky-800">
                            {formatQty(line.linkedQuantity)} applied to{" "}
                            {linkedRow?.countDate ? `count ${formatDate(linkedRow.countDate)}` : "a count reduction"}
                          </span>
                        ) : null}
                        {soldAfterCount(line) ? (
                          <span className="mt-0.5 block text-xs text-amber-800">
                            Dated {formatDate(line.saleDate)}, after the {formatDate(soldAfterCount(line))} count. If
                            these units sold before the count found them missing, date the line on or before{" "}
                            {formatDate(soldAfterCount(line))} — otherwise stock shows them on hand from{" "}
                            {formatDate(soldAfterCount(line))} until {formatDate(line.saleDate)}.
                          </span>
                        ) : null}
                      </td>
                      <td className={tdClass}>
                        <input
                          className={fieldClass}
                          type="date"
                          max={saleDate}
                          value={line.saleDate}
                          onChange={(event) => updateLineDate(line.key, event.target.value)}
                        />
                      </td>
                      <td className={tdClass}>
                        <input
                          className={cn(fieldClass, numberFieldClass, "text-right")}
                          type="number"
                          min="1"
                          step="1"
                          value={line.quantity === 0 ? "" : line.quantity}
                          onWheel={blurOnWheel}
                          onChange={(event) => updateQuantity(line.key, toQuantity(event.target.value))}
                        />
                      </td>
                      <td
                        className={cn(tdClass, "text-right", product?.costPrice === 0 ? "text-amber-700" : "text-muted")}
                        title={product?.costPrice === 0 ? NO_COST_HINT : undefined}
                      >
                        {product ? formatMoney(product.costPrice) : "—"}
                        {product?.costPrice === 0 ? <span className="block text-xs">No cost at this salon</span> : null}
                      </td>
                      <td className={tdClass}>
                        <input
                          className={cn(fieldClass, numberFieldClass, "text-right")}
                          type="number"
                          min="0"
                          step="0.01"
                          value={line.unitSalePrice}
                          onWheel={blurOnWheel}
                          onChange={(event) => updatePrice(line.key, toPrice(event.target.value))}
                        />
                      </td>
                      <td className={cn(tdClass, "text-right")}>{formatMoney(line.quantity * line.unitSalePrice)}</td>
                      <td className={tdClass}>
                        <button
                          type="button"
                          className="text-red-600 hover:text-red-800"
                          onClick={() => setLines(lines.filter((item) => item.key !== line.key))}
                          aria-label={`Remove ${label}`}
                        >
                          <Trash2 className="size-4" aria-hidden />
                        </button>
                      </td>
                    </tr>
                  );
                })}
                <tr className="font-semibold">
                  <td className={tdClass}>Total</td>
                  <td className={tdClass} />
                  <td className={cn(tdClass, "text-right")}>{totalQuantity}</td>
                  <td className={tdClass} />
                  <td className={tdClass} />
                  <td className={cn(tdClass, "text-right")}>{formatMoney(totalSales)}</td>
                  <td className={tdClass} />
                </tr>
              </tbody>
            </table>
          </div>
        )}
        {hasZeroCostLine ? (
          <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
            Lines marked &quot;No cost at this salon&quot; will be booked at $0 cost, because this salon has no cost
            recorded for those products yet. Record a receipt or an opening-balance count for them to give them a
            cost.
          </p>
        ) : null}
      </section>

      <section className="space-y-3">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold">Inventory count reductions</h2>
            <p className="mt-1 text-sm text-muted">
              Products an inventory count found short at this salon. Apply this sale to a reduction when the missing
              units were really sold — they move from inventory use to product sales, and aren&apos;t deducted from
              stock a second time.
            </p>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              className={checkboxClass}
              checked={onlyThisSale}
              onChange={(event) => setOnlyThisSale(event.target.checked)}
            />
            Only products on this sale
          </label>
        </div>

        <div className="max-h-[32rem] overflow-auto rounded-xl border border-border bg-card">
          <table className={tableClass}>
            <thead>
              <tr>
                <th className={cn(thClass, stickyHead)}>Product</th>
                <th className={cn(thClass, stickyHead)}>Count</th>
                <th className={cn(thClass, stickyHead, "text-right")}>Total reduction</th>
                <th className={cn(thClass, stickyHead, "text-right")}>Balance to clear</th>
                <th className={cn(thClass, stickyHead, "text-right")}>In this sale</th>
                <th className={cn(thClass, stickyHead)} />
                <th className={cn(thClass, stickyHead)}>Breakdown</th>
              </tr>
            </thead>
            <tbody>
              {countRows === null ? (
                <tr>
                  <td className={tdClass} colSpan={7}>
                    Loading inventory count reductions…
                  </td>
                </tr>
              ) : visibleCountRows.length === 0 ? (
                <tr>
                  <td className={cn(tdClass, "text-muted")} colSpan={7}>
                    {onlyThisSale
                      ? "None of the products on this sale have a count reduction left to clear."
                      : "No inventory count reductions left to clear at this salon."}
                  </td>
                </tr>
              ) : (
                visibleCountRows.map((row) => {
                  const inSale = saleQuantityFor(row.productId);
                  const applied = appliedTo(row.txnId);
                  const inventoryUse = row.remaining - applied;
                  const isBundle = productById.get(row.productId)?.isBundle;
                  const canApply =
                    applied === 0 && !isBundle && row.remaining > 0 && unappliedLines(row.productId).length > 0;
                  return (
                    <tr key={row.txnId} className={cn(applied > 0 && "bg-sky-50/60", inSale === 0 && "text-muted")}>
                      <td className={tdClass}>
                        {row.productLabel}
                        {row.sku ? <span className="block text-xs text-muted">{row.sku}</span> : null}
                      </td>
                      <td className={cn(tdClass, "whitespace-nowrap")}>
                        {row.countId ? (
                          <a
                            className="text-sky-700 underline"
                            href={`/counts/${row.countId}`}
                            target="_blank"
                            rel="noreferrer"
                          >
                            {row.countDate ? formatDate(row.countDate) : "Count"}
                          </a>
                        ) : (
                          "Count"
                        )}
                      </td>
                      <td className={cn(tdClass, "text-right text-red-600")}>−{formatQty(row.shortfall)}</td>
                      <td className={cn(tdClass, "text-right")}>
                        {formatQty(row.remaining)}
                        {row.linked > 0 ? (
                          <span className="block text-xs text-muted">{formatQty(row.linked)} cleared by earlier sales</span>
                        ) : null}
                      </td>
                      <td className={cn(tdClass, "text-right")}>{inSale > 0 ? formatQty(inSale) : "—"}</td>
                      <td className={tdClass}>
                        {applied > 0 ? (
                          <button
                            type="button"
                            className={cn(btnSecondaryClass, "px-2 py-1 text-xs")}
                            onClick={() => undo(row.txnId)}
                          >
                            Undo
                          </button>
                        ) : (
                          <button
                            type="button"
                            className={cn(btnClass, "px-2 py-1 text-xs")}
                            onClick={() => apply(row)}
                            disabled={!canApply}
                            title={
                              isBundle
                                ? "Bundles can't be applied to a count."
                                : inSale === 0
                                  ? "This product isn't on this sale."
                                  : !canApply
                                    ? "This sale's quantity for the product is already applied to another count."
                                    : undefined
                            }
                          >
                            Apply
                          </button>
                        )}
                      </td>
                      <td className={cn(tdClass, "whitespace-nowrap")}>
                        {inventoryUse > 0 ? <span className="text-red-600">−{formatQty(inventoryUse)} inventory use</span> : null}
                        {inventoryUse > 0 && applied > 0 ? ", " : null}
                        {applied > 0 ? (
                          <span className="font-medium text-sky-800">−{formatQty(applied)} product sales</span>
                        ) : null}
                        {lines.some((line) => line.linkedTxnId === row.txnId && soldAfterCount(line)) ? (
                          <span className="block text-xs text-amber-800">Sale is dated after this count</span>
                        ) : null}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </section>

      {lines.length > 0 ? (
        <section className="space-y-3">
          <div>
            <h2 className="text-lg font-semibold">Inventory balance</h2>
            <p className="mt-1 text-sm text-muted">
              What saving this sale does to stock at {branchName}. Units applied to a count reduction aren&apos;t
              deducted again — the count already took them out.
            </p>
          </div>
          <div className="overflow-x-auto rounded-xl border border-border bg-card">
            <table className={tableClass}>
              <thead>
                <tr>
                  <th className={thClass}>Name</th>
                  <th className={cn(thClass, "text-right")}>Starting balance</th>
                  <th className={cn(thClass, "text-right")}>Reduction</th>
                  <th className={cn(thClass, "text-right")}>Closing balance</th>
                </tr>
              </thead>
              <tbody>
                {balanceRows.map((row) => {
                  const closing = row.starting - row.reduction;
                  return (
                    <tr key={row.productId} className={cn(closing < 0 && "bg-red-50")}>
                      <td className={tdClass}>
                        {row.label}
                        {row.sku ? <span className="block text-xs text-muted">{row.sku}</span> : null}
                        {row.viaBundle.size > 0 ? (
                          <span className="block text-xs text-muted">From bundle: {[...row.viaBundle].join(", ")}</span>
                        ) : null}
                      </td>
                      <td className={cn(tdClass, "text-right")}>{formatQty(row.starting)}</td>
                      <td className={cn(tdClass, "text-right")}>
                        <span className={row.reduction > 0 ? "text-red-600" : "text-muted"}>
                          {row.reduction > 0 ? `−${formatQty(row.reduction)}` : "0"}
                        </span>
                        {row.applied > 0 ? (
                          <span className="block text-xs text-sky-800">
                            {formatQty(row.applied)} applied to count — not deducted again
                          </span>
                        ) : null}
                      </td>
                      <td className={cn(tdClass, "text-right font-medium", closing < 0 && "text-red-700")}>
                        {formatQty(closing)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {hasNegativeClosing ? (
            <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
              Some products would go below zero. If a count already recorded these units as missing, apply this sale
              to that count reduction above instead of deducting them again.
            </p>
          ) : null}
        </section>
      ) : null}

      <div className="flex flex-wrap items-center gap-3">
        <button className={btnSecondaryClass} type="button" disabled={cannotSave} onClick={() => void save(false)}>
          {pending === "draft" ? "Saving draft…" : "Save draft"}
        </button>
        <button className={btnClass} type="button" disabled={cannotSave} onClick={() => void save(true)}>
          {pending === "confirm" ? "Confirming…" : `Confirm sale for ${branchName}`}
        </button>
        <p className="text-xs text-muted">
          A draft saves everything but doesn&apos;t touch stock or costs. Confirming posts it.
        </p>
      </div>
    </form>
  );
}
