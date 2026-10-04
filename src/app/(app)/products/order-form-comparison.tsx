"use client";

import { Fragment, useMemo, useState, useTransition } from "react";
import type { OrderFormLine } from "@/lib/order-form-reader";
import { KEPT_OFF, lineUp, type ComparisonProduct, type Row } from "@/lib/order-form-match";

export type { ComparisonProduct };
import type { OrderFormMatch } from "@/lib/data/order-forms";
import {
  clearOrderFormMatches,
  saveOrderFormMatches,
  type OrderFormMatchChange,
} from "@/app/(app)/admin/suppliers/order-form-actions";
import { formatMoney } from "@/lib/format";
import { findSize, sizesClose } from "@/lib/product-size";
import {
  btnClass,
  btnSecondaryClass,
  checkboxClass,
  fieldClass,
  tableClass,
  tdClass,
  thClass,
} from "@/lib/ui";
import { cn } from "@/lib/utils";

/** A product typed into a new row under the Pulse table (the columns it shows). */
export type NewPriceListRow = {
  sku: string;
  orderName: string;
  size: string;
  unitCost: string;
  rrp: string;
};
/** `fromLine`: the order form line it was copied from, if any. */
type DraftRow = NewPriceListRow & { key: string; fromLine?: string };

const differs = (left: number | null, right: number | null) =>
  left != null && right != null && Math.abs(left - right) > 0.005;

/**
 * The hand-set matches made by swapping the Pulse products of two rows. A
 * product swapped onto a row with no order form line comes off the form.
 */
function planSwap(a: Row, b: Row): OrderFormMatchChange[] {
  if (a === b || (!a.lineKey && !b.lineKey) || (!a.pulse && !b.pulse)) return [];
  const changes: OrderFormMatchChange[] = [];
  for (const [row, other] of [
    [a, b],
    [b, a],
  ] as const) {
    if (row.lineKey) changes.push({ lineKey: row.lineKey, productId: other.pulse?.id ?? null });
    else if (other.pulse)
      changes.push({ lineKey: `${KEPT_OFF}${other.pulse.id}`, productId: other.pulse.id });
  }
  return changes;
}

/** Takes a row's Pulse product off its order form line. */
function planUnmatch(row: Row): OrderFormMatchChange[] {
  if (!row.lineKey || !row.pulse) return [];
  return [
    { lineKey: row.lineKey, productId: null },
    { lineKey: `${KEPT_OFF}${row.pulse.id}`, productId: row.pulse.id },
  ];
}

/** Hand-set matches after `changes` (a product sits on one row, so its other hand-set rows go). */
function applyChanges(manual: Map<string, string | null>, changes: OrderFormMatchChange[]) {
  const next = new Map(manual);
  const keys = new Set(changes.map((change) => change.lineKey));
  const productIds = new Set(
    changes.flatMap((change) => (change.productId ? [change.productId] : [])),
  );
  for (const [key, productId] of next)
    if (productId && productIds.has(productId) && !keys.has(key)) next.delete(key);
  for (const change of changes) next.set(change.lineKey, change.productId);
  return next;
}

const rowIdOf = (row: Row) => row.lineKey ?? `product-${row.pulse?.id}`;

/** Order form minus Pulse, or null when either side has no amount. */
function varianceOf(pulse: number | null | undefined, form: number | null | undefined) {
  if (pulse == null || form == null) return null;
  const value = form - pulse;
  return Math.abs(value) < 0.005 ? 0 : value;
}

type SizeCheck =
  | { state: "same" | "different"; pulse: string; form: string }
  | { state: "unknown"; pulse: string | null; form: string | null };

/**
 * Compares sizes: Pulse's size column (or its name), against the form's size
 * column (or its description). Ounces are converted; within 3% counts as the same.
 */
function sizeCheckOf(pulse: ComparisonProduct | null, form: OrderFormLine | null): SizeCheck {
  const pulseSize = pulse
    ? (findSize(pulse.size) ?? findSize(pulse.orderName) ?? findSize(pulse.name))
    : null;
  const formSize = form ? (findSize(form.size) ?? findSize(form.description)) : null;
  if (!pulseSize || !formSize)
    return { state: "unknown", pulse: pulseSize?.label ?? null, form: formSize?.label ?? null };
  return {
    state: sizesClose(pulseSize.ml, formSize.ml) ? "same" : "different",
    pulse: pulseSize.label,
    form: formSize.label,
  };
}

function SizeCheckCell({ check }: { check: SizeCheck }) {
  if (check.state === "same") {
    return (
      <td
        className={cn(tdClass, "whitespace-nowrap text-center text-emerald-700")}
        title={`${check.pulse} = ${check.form}`}
      >
        ✓
      </td>
    );
  }
  if (check.state === "different") {
    return (
      <td className={cn(tdClass, "whitespace-nowrap bg-amber-50 text-center")}>
        <span className="font-semibold text-amber-800">Check</span>
        <span className="block text-xs text-muted">
          Pulse {check.pulse} · form {check.form}
        </span>
      </td>
    );
  }
  const missing =
    !check.pulse && !check.form
      ? "either side"
      : !check.pulse
        ? "the Pulse product"
        : "the order form";
  return (
    <td className={cn(tdClass, "text-center text-muted")} title={`No size found on ${missing}`}>
      —
    </td>
  );
}

function VarianceCell({ value, className }: { value: number | null; className?: string }) {
  return (
    <td
      className={cn(
        tdClass,
        "whitespace-nowrap text-right tabular-nums",
        value == null || value === 0 ? "text-muted" : "bg-amber-50 font-semibold",
        value != null && value > 0 && "text-red-700",
        value != null && value < 0 && "text-emerald-700",
        className,
      )}
    >
      {value == null
        ? "—"
        : value === 0
          ? formatMoney(0)
          : `${value > 0 ? "+" : "−"}${formatMoney(Math.abs(value))}`}
    </td>
  );
}

/**
 * A brand's products on a supplier's price list: Pulse (left) against the
 * uploaded order form (middle), row by row, with the price differences
 * (right) — or just the Pulse side when no form is uploaded. The order form's
 * rows stay in the form's order; a wrong pairing is fixed by ticking two rows
 * and swapping their Pulse products (saved, and kept when the same form is
 * uploaded again). Each product has its own Edit button.
 */
export function OrderFormComparison({
  supplierId,
  brandId,
  brand,
  products,
  lines,
  matches,
  onEditProduct,
  onAddProducts,
  editDisabled = false,
}: {
  supplierId: string;
  brandId: string | null;
  brand: string;
  products: ComparisonProduct[];
  /** The order form's lines, or null when none is uploaded (Pulse side only). */
  lines: OrderFormLine[] | null;
  /** Matches saved by hand for this supplier and brand. */
  matches: OrderFormMatch[];
  /** Opens a product's form, with its order form line (if any) for reference. */
  onEditProduct: (productId: string, line: OrderFormLine | null) => void;
  /** Saves new rows as products of this brand and supplier; throw an Error to show its message. */
  onAddProducts?: (rows: NewPriceListRow[]) => Promise<void>;
  editDisabled?: boolean;
}) {
  const hasForm = lines != null;
  const canSwap = hasForm && Boolean(brandId);
  const [manual, setManual] = useState(
    () => new Map(matches.map((match) => [match.lineKey, match.productId])),
  );
  /** Which swap set each hand-set row (the rows of one swap are undone together). */
  const [swapOf, setSwapOf] = useState(
    () => new Map(matches.map((match) => [match.lineKey, match.matchedAt])),
  );
  /** Ticked rows (at most two). */
  const [picked, setPicked] = useState<string[]>([]);
  const [matchError, setMatchError] = useState<string | null>(null);
  const [saving, startSaving] = useTransition();
  // Paired rows first (in the form's order), then the unmatched ones together at the bottom for matching:
  // form lines with no product, then products not on the form.
  const rows = useMemo(() => {
    const lined = lineUp(products, lines ?? [], manual);
    return [
      ...lined.filter((row) => row.pulse && row.form),
      ...lined.filter((row) => row.form && !row.pulse),
      ...lined.filter((row) => row.pulse && !row.form),
    ];
  }, [products, lines, manual]);
  const firstUnmatched = hasForm ? rows.findIndex((row) => !row.pulse || !row.form) : -1;
  const pickedRows = picked.flatMap((id) => rows.filter((row) => rowIdOf(row) === id));
  const swapChanges = pickedRows.length === 2 ? planSwap(pickedRows[0], pickedRows[1]) : [];
  const unmatchChanges = pickedRows.length === 1 ? planUnmatch(pickedRows[0]) : [];
  const counts = {
    manual: rows.filter((row) => row.match === "manual").length,
    sku: rows.filter((row) => row.match === "sku").length,
    name: rows.filter((row) => row.match === "name" || row.match === "similar").length,
    formOnly: rows.filter((row) => row.form && !row.pulse).length,
    pulseOnly: rows.filter((row) => row.pulse && !row.form).length,
    size: rows.filter((row) => sizeCheckOf(row.pulse, row.form).state === "different").length,
    cost: rows.filter((row) => (varianceOf(row.pulse?.unitCost, row.form?.cost) ?? 0) !== 0).length,
    rrp: rows.filter((row) => (varianceOf(row.pulse?.rrp, row.form?.rrp) ?? 0) !== 0).length,
  };
  const pulseColumns = (canSwap ? 1 : 0) + 6;
  const [drafts, setDrafts] = useState<DraftRow[]>([]);
  const [focusKey, setFocusKey] = useState<string | null>(null);
  const [addError, setAddError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  /** Adds a new Pulse product row filled from an order form line (saved with the other new rows). */
  function copyFromLine(lineKey: string, line: OrderFormLine) {
    if (drafts.some((draft) => draft.fromLine === lineKey)) return;
    setDrafts((current) => [
      ...current,
      {
        key: crypto.randomUUID(),
        fromLine: lineKey,
        sku: line.sku,
        orderName: line.description,
        size: line.size,
        unitCost: line.cost == null ? "" : line.cost.toFixed(2),
        rrp: line.rrp == null ? "" : line.rrp.toFixed(2),
      },
    ]);
    setAddError(null);
  }

  function addDraft() {
    const key = crypto.randomUUID();
    setDrafts((current) => [
      ...current,
      { key, sku: "", orderName: "", size: "", unitCost: "", rrp: "" },
    ]);
    setFocusKey(key);
  }

  function updateDraft(key: string, patch: Partial<NewPriceListRow>) {
    setDrafts((current) =>
      current.map((draft) => (draft.key === key ? { ...draft, ...patch } : draft)),
    );
  }

  async function saveDrafts() {
    if (!onAddProducts) return;
    const filled = drafts.filter((draft) =>
      [draft.sku, draft.orderName, draft.size, draft.unitCost, draft.rrp].some((value) =>
        value.trim(),
      ),
    );
    if (filled.length === 0) {
      setDrafts([]);
      return;
    }
    if (filled.some((draft) => !draft.orderName.trim())) {
      setAddError("Every new row needs an order name.");
      return;
    }
    const badNumber = filled.find((draft) =>
      [draft.unitCost, draft.rrp].some((value) => value.trim() && !Number.isFinite(Number(value))),
    );
    if (badNumber) {
      setAddError(`The unit cost and RRP of ${badNumber.orderName.trim()} must be numbers.`);
      return;
    }
    setAdding(true);
    setAddError(null);
    try {
      await onAddProducts(
        filled.map(({ sku, orderName, size, unitCost, rrp }) => ({
          sku,
          orderName,
          size,
          unitCost,
          rrp,
        })),
      );
      setDrafts([]);
    } catch (err) {
      setAddError(err instanceof Error ? err.message : "Could not add those products.");
    } finally {
      setAdding(false);
    }
  }

  /** Shows `next` straight away and saves it; puts the old matches back if saving fails. */
  function persist(
    next: Map<string, string | null>,
    nextSwaps: Map<string, string>,
    save: (brand: string) => Promise<void>,
  ) {
    if (!brandId) return;
    const previous = manual;
    const previousSwaps = swapOf;
    setManual(next);
    setSwapOf(nextSwaps);
    setPicked([]);
    setMatchError(null);
    startSaving(async () => {
      try {
        await save(brandId);
      } catch (err) {
        setManual(previous);
        setSwapOf(previousSwaps);
        setMatchError(err instanceof Error ? err.message : "Could not save that change.");
      }
    });
  }

  function apply(changes: OrderFormMatchChange[]) {
    if (changes.length === 0) return;
    const next = applyChanges(manual, changes);
    const swap = crypto.randomUUID();
    const nextSwaps = new Map([...swapOf].filter(([key]) => next.has(key)));
    for (const change of changes) nextSwaps.set(change.lineKey, swap);
    persist(next, nextSwaps, (brandKey) => saveOrderFormMatches(supplierId, brandKey, changes));
  }

  /** Undoes the swap that set this row: it and the other row(s) of that swap go back to automatic. */
  function undoSwap(row: Row) {
    const key = row.lineKey ?? `${KEPT_OFF}${row.pulse?.id}`;
    const swap = swapOf.get(key);
    const keys = swap
      ? [...swapOf].filter(([, value]) => value === swap).map(([lineKey]) => lineKey)
      : [key];
    const next = new Map(manual);
    const nextSwaps = new Map(swapOf);
    for (const lineKey of keys) {
      next.delete(lineKey);
      nextSwaps.delete(lineKey);
    }
    persist(next, nextSwaps, (brandKey) => clearOrderFormMatches(supplierId, brandKey, keys));
  }

  const undoLink = (row: Row) => (
    <button
      type="button"
      className="block text-xs text-sky-800 underline disabled:text-slate-400"
      disabled={saving}
      onClick={() => undoSwap(row)}
    >
      Undo swap
    </button>
  );

  function togglePicked(rowId: string) {
    setPicked((current) =>
      current.includes(rowId)
        ? current.filter((id) => id !== rowId)
        : current.length >= 2
          ? current
          : [...current, rowId],
    );
  }

  function resetAll() {
    if (!window.confirm(`Put every ${brand} row back on automatic matching?`)) return;
    persist(new Map(), new Map(), (brandKey) => clearOrderFormMatches(supplierId, brandKey));
  }

  return (
    <section className="space-y-2">
      <div>
        <h3 className="text-base font-semibold">
          {brand}
          {hasForm ? ": Pulse vs order form" : ` (${products.length})`}
        </h3>
        {hasForm ? (
          <p className="text-sm text-muted">
            {counts.sku} matched by SKU ·{" "}
            <span className="text-amber-800">{counts.name} matched by name</span> ·{" "}
            <span className="text-sky-800">{counts.manual} swapped by you</span>
            {counts.manual > 0 ? (
              <button
                type="button"
                className="ml-1 text-sky-800 underline"
                disabled={saving}
                onClick={resetAll}
              >
                (reset all)
              </button>
            ) : null}{" "}
            ·{" "}
            <span className="text-red-700">
              {counts.formOnly} only on the order form · {counts.pulseOnly} only on Pulse
            </span>{" "}
            · {counts.size} size, {counts.cost} unit cost and {counts.rrp} RRP differences. To fix a
            pairing, tick two rows and click Swap; their Pulse products change places.
          </p>
        ) : (
          <p className="text-sm text-muted">
            Upload this brand&apos;s order form to compare it with these products.
          </p>
        )}
        {matchError ? <p className="mt-1 text-sm text-red-700">{matchError}</p> : null}
      </div>
      <div className="max-h-[70vh] overflow-auto rounded-xl border border-border bg-card">
        <table className={cn(tableClass, "border-separate border-spacing-0")}>
          <thead className="sticky top-0 z-10 bg-card">
            {hasForm ? (
              <tr>
                <th className={cn(thClass, "bg-slate-100 text-center")} colSpan={pulseColumns}>
                  Pulse ({products.length})
                </th>
                <th className="w-3 bg-card" aria-hidden />
                <th className={cn(thClass, "bg-sky-100 text-center")} colSpan={5}>
                  Order form ({lines.length})
                </th>
                <th className="w-3 bg-card" aria-hidden />
                <th className={cn(thClass, "bg-amber-100 text-center")} colSpan={3}>
                  Variance (form − Pulse)
                </th>
              </tr>
            ) : null}
            <tr>
              {canSwap ? (
                <th className={cn(thClass, "whitespace-nowrap")}>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      className={cn(
                        "text-sm font-medium underline",
                        swapChanges.length > 0 ? "text-blue-600" : "text-slate-400",
                      )}
                      disabled={saving || swapChanges.length === 0}
                      onClick={() => apply(swapChanges)}
                      title={
                        picked.length < 2
                          ? "Tick two rows to swap their Pulse products"
                          : swapChanges.length === 0
                            ? "These two rows have nothing to swap"
                            : "Swap the Pulse products of the two ticked rows"
                      }
                    >
                      Swap
                    </button>
                    {unmatchChanges.length > 0 ? (
                      <button
                        type="button"
                        className="text-sm font-medium text-blue-600 underline"
                        disabled={saving}
                        onClick={() => apply(unmatchChanges)}
                        title="This product isn't on the order form: take it off this line"
                      >
                        Unmatch
                      </button>
                    ) : null}
                  </div>
                </th>
              ) : null}
              <th className={thClass}>SKU</th>
              <th className={thClass}>Order name</th>
              <th className={thClass}>Size</th>
              <th className={cn(thClass, "text-right")}>Unit cost</th>
              <th className={cn(thClass, "text-right")}>RRP</th>
              <th className={thClass}>
                <span className="sr-only">Edit</span>
              </th>
              {hasForm ? (
                <>
                  <th className="w-3 bg-card" aria-hidden />
                  <th className={thClass}>SKU</th>
                  <th className={thClass}>Description</th>
                  <th className={thClass}>Size</th>
                  <th className={cn(thClass, "text-right")}>Price</th>
                  <th className={cn(thClass, "text-right")}>RRP</th>
                  <th className="w-3 bg-card" aria-hidden />
                  <th className={cn(thClass, "text-center")}>Size</th>
                  <th className={cn(thClass, "text-right")}>Unit cost</th>
                  <th className={cn(thClass, "text-right")}>RRP</th>
                </>
              ) : null}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td
                  className={cn(tdClass, "text-muted")}
                  colSpan={hasForm ? pulseColumns + 10 : pulseColumns}
                >
                  No {brand} products on this price list yet.
                </td>
              </tr>
            ) : null}
            {rows.map((row, rowIndex) => {
              const rowId = rowIdOf(row);
              const isPicked = picked.includes(rowId);
              const tone =
                row.match === "manual"
                  ? "bg-sky-50"
                  : row.match === "name" || row.match === "similar" || row.namesDiffer
                    ? "bg-amber-50"
                    : "";
              const pulseTone = isPicked
                ? "bg-blue-100"
                : !hasForm
                  ? ""
                  : !row.form || !row.pulse
                    ? "bg-red-50"
                    : tone;
              const formTone = !row.pulse ? "bg-red-50" : tone;
              const costDiffers = differs(row.pulse?.unitCost ?? null, row.form?.cost ?? null);
              const rrpDiffers = differs(row.pulse?.rrp ?? null, row.form?.rrp ?? null);
              const pulse = row.pulse;
              const pickBox = canSwap ? (
                <td className={cn(tdClass, pulseTone)}>
                  <input
                    type="checkbox"
                    className={checkboxClass}
                    checked={isPicked}
                    disabled={saving || (!isPicked && picked.length >= 2)}
                    onChange={() => togglePicked(rowId)}
                    aria-label={`Tick ${pulse ? pulse.orderName || pulse.name : (row.form?.description ?? "row")} to swap`}
                  />
                </td>
              ) : null;
              return (
                <Fragment key={rowId}>
                  {rowIndex === firstUnmatched ? (
                    <tr>
                      <td
                        className={cn(tdClass, "bg-red-100 text-sm font-semibold text-red-900")}
                        colSpan={pulseColumns + 10}
                      >
                        Unmatched ({rows.length - firstUnmatched}): tick an order form line and a
                        Pulse product below, then Swap to pair them.
                      </td>
                    </tr>
                  ) : null}
                  <tr>
                    {pulse ? (
                      <>
                        {pickBox}
                        <td className={cn(tdClass, pulseTone, "whitespace-nowrap")}>
                          {pulse.sku || "—"}
                        </td>
                        <td className={cn(tdClass, pulseTone)}>
                          {pulse.orderName || pulse.name}
                          {row.match === "manual" ? undoLink(row) : null}
                        </td>
                        <td className={cn(tdClass, pulseTone, "whitespace-nowrap")}>
                          {pulse.size || "—"}
                        </td>
                        <td
                          className={cn(
                            tdClass,
                            pulseTone,
                            "text-right tabular-nums",
                            costDiffers && "font-bold",
                          )}
                        >
                          {formatMoney(pulse.unitCost)}
                        </td>
                        <td
                          className={cn(
                            tdClass,
                            pulseTone,
                            "text-right tabular-nums",
                            rrpDiffers && "font-bold",
                          )}
                        >
                          {pulse.rrp == null ? "—" : formatMoney(pulse.rrp)}
                        </td>
                        <td className={cn(tdClass, pulseTone)}>
                          <button
                            type="button"
                            className="text-sm text-blue-600 underline disabled:text-slate-400"
                            disabled={editDisabled}
                            onClick={() => onEditProduct(pulse.id, row.form)}
                            title={
                              row.form
                                ? "Edit this product (the order form line is shown for reference)"
                                : "Edit this product"
                            }
                          >
                            Edit
                          </button>
                        </td>
                      </>
                    ) : (
                      <>
                        {pickBox}
                        <td className={cn(tdClass, pulseTone, "text-sm text-red-700")} colSpan={6}>
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <span>
                              Not on Pulse
                              {row.match === "manual" ? undoLink(row) : null}
                            </span>
                            {onAddProducts && row.form && row.lineKey ? (
                              drafts.some((draft) => draft.fromLine === row.lineKey) ? (
                                <span className="text-xs text-emerald-800">
                                  Copied: save it under the table
                                </span>
                              ) : (
                                <button
                                  type="button"
                                  className="text-sm text-blue-600 underline disabled:text-slate-400"
                                  disabled={adding}
                                  onClick={() => copyFromLine(row.lineKey!, row.form!)}
                                  title="Add this line to Pulse as a new product (SKU, description, size, price and RRP), saved with Save new products"
                                >
                                  Copy from order form
                                </button>
                              )
                            ) : null}
                          </div>
                        </td>
                      </>
                    )}
                    {hasForm ? (
                      <>
                        <td className="w-3 bg-card" aria-hidden />
                        {row.form ? (
                          <>
                            <td className={cn(tdClass, formTone, "whitespace-nowrap")}>
                              {row.form.sku || "—"}
                            </td>
                            <td className={cn(tdClass, formTone)}>
                              {row.form.description}
                              <span className="block text-xs text-muted">{row.form.source}</span>
                            </td>
                            <td className={cn(tdClass, formTone, "whitespace-nowrap")}>
                              {row.form.size || "—"}
                            </td>
                            <td
                              className={cn(
                                tdClass,
                                formTone,
                                "text-right tabular-nums",
                                costDiffers && "font-bold",
                              )}
                            >
                              {row.form.cost == null ? "—" : formatMoney(row.form.cost)}
                            </td>
                            <td
                              className={cn(
                                tdClass,
                                formTone,
                                "text-right tabular-nums",
                                rrpDiffers && "font-bold",
                              )}
                            >
                              {row.form.rrp == null ? "—" : formatMoney(row.form.rrp)}
                            </td>
                          </>
                        ) : (
                          <td className={cn(tdClass, "bg-red-50 text-sm text-red-700")} colSpan={5}>
                            Not on the order form
                          </td>
                        )}
                        <td className="w-3 bg-card" aria-hidden />
                        <SizeCheckCell check={sizeCheckOf(row.pulse, row.form)} />
                        <VarianceCell value={varianceOf(row.pulse?.unitCost, row.form?.cost)} />
                        <VarianceCell value={varianceOf(row.pulse?.rrp, row.form?.rrp)} />
                      </>
                    ) : null}
                  </tr>
                </Fragment>
              );
            })}
            {drafts.map((draft) => (
              <tr key={draft.key}>
                {canSwap ? <td className={cn(tdClass, "bg-emerald-50")} /> : null}
                <td className={cn(tdClass, "bg-emerald-50")}>
                  <input
                    className={cn(fieldClass, "min-w-24")}
                    value={draft.sku}
                    autoFocus={draft.key === focusKey}
                    onChange={(event) => updateDraft(draft.key, { sku: event.target.value })}
                    placeholder="SKU"
                    aria-label="New product SKU"
                  />
                </td>
                <td className={cn(tdClass, "bg-emerald-50")}>
                  <input
                    className={cn(fieldClass, "min-w-56")}
                    value={draft.orderName}
                    onChange={(event) => updateDraft(draft.key, { orderName: event.target.value })}
                    placeholder="Order name *"
                    aria-label="New product order name"
                  />
                </td>
                <td className={cn(tdClass, "bg-emerald-50")}>
                  <input
                    className={cn(fieldClass, "min-w-20")}
                    value={draft.size}
                    onChange={(event) => updateDraft(draft.key, { size: event.target.value })}
                    placeholder="e.g. 250 ml"
                    aria-label="New product size"
                  />
                </td>
                <td className={cn(tdClass, "bg-emerald-50")}>
                  <input
                    className={cn(fieldClass, "min-w-20 text-right")}
                    inputMode="decimal"
                    value={draft.unitCost}
                    onChange={(event) => updateDraft(draft.key, { unitCost: event.target.value })}
                    placeholder="0.00"
                    aria-label="New product unit cost"
                  />
                </td>
                <td className={cn(tdClass, "bg-emerald-50")}>
                  <input
                    className={cn(fieldClass, "min-w-20 text-right")}
                    inputMode="decimal"
                    value={draft.rrp}
                    onChange={(event) => updateDraft(draft.key, { rrp: event.target.value })}
                    placeholder="0.00"
                    aria-label="New product RRP"
                  />
                </td>
                <td className={cn(tdClass, "bg-emerald-50")}>
                  <button
                    type="button"
                    className="text-sm text-red-700 underline"
                    disabled={adding}
                    onClick={() =>
                      setDrafts((current) => current.filter((item) => item.key !== draft.key))
                    }
                  >
                    Remove
                  </button>
                </td>
                {hasForm ? (
                  <>
                    <td className="w-3 bg-card" aria-hidden />
                    <td className={cn(tdClass, "text-sm text-muted")} colSpan={5}>
                      New product: lines up with the order form once saved
                    </td>
                    <td className="w-3 bg-card" aria-hidden />
                    <td className={tdClass} colSpan={3} />
                  </>
                ) : null}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {onAddProducts ? (
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" className={btnSecondaryClass} disabled={adding} onClick={addDraft}>
            Add row
          </button>
          {drafts.length > 0 ? (
            <>
              <button
                type="button"
                className={btnClass}
                disabled={adding}
                onClick={() => void saveDrafts()}
              >
                {adding
                  ? "Saving…"
                  : drafts.length === 1
                    ? "Save new product"
                    : `Save ${drafts.length} new products`}
              </button>
              <button
                type="button"
                className={btnSecondaryClass}
                disabled={adding}
                onClick={() => {
                  setDrafts([]);
                  setAddError(null);
                }}
              >
                Cancel
              </button>
              <span className="text-sm text-muted">
                New products are added to {brand} on this price list.
              </span>
            </>
          ) : null}
          {addError ? <p className="w-full text-sm text-red-700">{addError}</p> : null}
        </div>
      ) : null}
    </section>
  );
}
