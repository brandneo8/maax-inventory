"use client";

import { useMemo, useState, useTransition } from "react";
import type { OrderFormLine } from "@/lib/order-form-reader";
import type { OrderFormMatch } from "@/lib/data/order-forms";
import {
  clearOrderFormMatches,
  saveOrderFormMatches,
  type OrderFormMatchChange,
} from "@/app/(app)/admin/suppliers/order-form-actions";
import { formatMoney } from "@/lib/format";
import { findSize, sizesClose } from "@/lib/product-size";
import { btnClass, btnSecondaryClass, checkboxClass, fieldClass, tableClass, tdClass, thClass } from "@/lib/ui";
import { cn } from "@/lib/utils";

export type ComparisonProduct = {
  id: string;
  sku: string;
  orderName: string;
  name: string;
  size: string;
  unitCost: number;
  rrp: number | null;
};

/** A product typed into a new row under the Pulse table (the columns it shows). */
export type NewPriceListRow = { sku: string; orderName: string; size: string; unitCost: string; rrp: string };
type DraftRow = NewPriceListRow & { key: string };

/** How a row's two sides were paired. */
type Match = "manual" | "sku" | "name" | "similar" | "none";
type Row = {
  pulse: ComparisonProduct | null;
  form: OrderFormLine | null;
  /** The form line's key (for saving a match by hand); null on Pulse-only rows. */
  lineKey: string | null;
  match: Match;
  /** Paired by SKU, but the names have little in common. */
  namesDiffer: boolean;
};

/** SKUs compared ignoring case, spaces and leading zeros ("01402" = "1402"). */
function skuKey(value: string) {
  const compact = value.toUpperCase().replace(/\s+/g, "");
  return /^\d+$/.test(compact) ? String(Number(compact)) : compact;
}

/** Names compared on letters and digits only ("Treatment Original 200ml" = "treatment original 200 ML"). */
function nameKey(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function words(value: string) {
  return new Set(value.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean));
}

/** Share of words two names have in common (0 to 1). */
function similarity(left: string, right: string) {
  const a = words(left);
  const b = words(right);
  if (a.size === 0 || b.size === 0) return 0;
  let shared = 0;
  for (const word of a) if (b.has(word)) shared += 1;
  return shared / (a.size + b.size - shared);
}

/**
 * Share of the shorter name's words found in the other (0 to 1), or 0 when
 * fewer than three words are shared — forms often add words ("Backbar",
 * "Launch May 2026") that shouldn't stop a match.
 */
function containment(left: string, right: string) {
  const a = words(left);
  const b = words(right);
  let shared = 0;
  for (const word of a) if (b.has(word)) shared += 1;
  return shared < 3 ? 0 : shared / Math.min(a.size, b.size);
}

function productLabel(product: ComparisonProduct) {
  return [product.orderName || product.name, product.size].filter(Boolean).join(" ");
}

function productSimilarity(
  product: ComparisonProduct,
  line: OrderFormLine,
  measure: (left: string, right: string) => number = similarity,
) {
  const formName = `${line.description} ${line.size}`;
  return Math.max(measure(productLabel(product), formName), measure(`${product.name} ${product.size}`, formName));
}

/** Below this (share of words in common), names are too different to pair without a matching SKU. */
const SIMILAR_NAMES = 0.7;
/** Below this, a SKU pairing is flagged for checking. */
const DIFFERENT_NAMES = 0.25;

/** Hand-set key prefix for a product kept off the order form: `!<productId>`. */
const KEPT_OFF = "!";

/** Identifies a form line across re-uploads of the same form: its SKU and description. */
function lineKeys(lines: OrderFormLine[]) {
  const seen = new Map<string, number>();
  return lines.map((line) => {
    const base = `${skuKey(line.sku)}|${nameKey(line.description)}`;
    const count = (seen.get(base) ?? 0) + 1;
    seen.set(base, count);
    return count === 1 ? base : `${base}#${count}`;
  });
}

/** Pairs (line, product) greedily, best score first, each side used once. */
function pairBest(
  rows: Row[],
  products: ComparisonProduct[],
  unmatched: Set<string>,
  score: (row: Row, product: ComparisonProduct) => number | null,
  match: Match,
) {
  const pairs: { row: Row; product: ComparisonProduct; score: number }[] = [];
  for (const row of rows) {
    if (row.match !== "none" || !row.form) continue;
    for (const product of products) {
      if (!unmatched.has(product.id)) continue;
      const value = score(row, product);
      if (value != null) pairs.push({ row, product, score: value });
    }
  }
  pairs.sort((left, right) => right.score - left.score);
  for (const pair of pairs) {
    if (pair.row.match !== "none" || !unmatched.has(pair.product.id)) continue;
    unmatched.delete(pair.product.id);
    pair.row.pulse = pair.product;
    pair.row.match = match;
    if (match === "sku") pair.row.namesDiffer = pair.score < DIFFERENT_NAMES;
  }
}

/**
 * Lines up the order form against this brand's products on Pulse: matches set
 * by hand first (including products kept off the form), then the same SKU (the closest name wins when the form
 * repeats a SKU), then the same name, then a similar name. Products the form
 * doesn't list go at the end.
 */
function lineUp(products: ComparisonProduct[], lines: OrderFormLine[], manual: Map<string, string | null>): Row[] {
  const unmatched = new Set(products.map((product) => product.id));
  const byId = new Map(products.map((product) => [product.id, product]));
  const keys = lineKeys(lines);
  const keptOff = new Set<string>();
  for (const [key, productId] of manual) {
    if (key.startsWith(KEPT_OFF) && productId && byId.has(productId)) {
      keptOff.add(productId);
      unmatched.delete(productId);
    }
  }

  const rows: Row[] = lines.map((line, index) => {
    const lineKey = keys[index];
    if (manual.has(lineKey)) {
      const productId = manual.get(lineKey);
      const product = productId ? byId.get(productId) : undefined;
      if (productId == null) return { pulse: null, form: line, lineKey, match: "manual", namesDiffer: false };
      if (product && unmatched.has(product.id)) {
        unmatched.delete(product.id);
        return { pulse: product, form: line, lineKey, match: "manual", namesDiffer: false };
      }
    }
    return { pulse: null, form: line, lineKey, match: "none", namesDiffer: false };
  });

  pairBest(
    rows,
    products,
    unmatched,
    (row, product) =>
      row.form!.sku && product.sku && skuKey(row.form!.sku) === skuKey(product.sku)
        ? productSimilarity(product, row.form!)
        : null,
    "sku",
  );
  pairBest(
    rows,
    products,
    unmatched,
    (row, product) => {
      const formKeys = new Set([nameKey(row.form!.description), nameKey(`${row.form!.description} ${row.form!.size}`)]);
      const same = [product.orderName, product.name, `${product.orderName} ${product.size}`, `${product.name} ${product.size}`]
        .filter((value) => value.trim())
        .some((value) => formKeys.has(nameKey(value)));
      return same ? 1 : null;
    },
    "name",
  );
  pairBest(
    rows,
    products,
    unmatched,
    (row, product) => {
      const value = productSimilarity(product, row.form!, containment);
      return value >= SIMILAR_NAMES ? value + productSimilarity(product, row.form!) / 10 : null;
    },
    "similar",
  );

  for (const product of products) {
    if (unmatched.has(product.id) || keptOff.has(product.id)) {
      const match = keptOff.has(product.id) ? "manual" : "none";
      rows.push({ pulse: product, form: null, lineKey: null, match, namesDiffer: false });
    }
  }
  return rows;
}

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
    else if (other.pulse) changes.push({ lineKey: `${KEPT_OFF}${other.pulse.id}`, productId: other.pulse.id });
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
  const productIds = new Set(changes.flatMap((change) => (change.productId ? [change.productId] : [])));
  for (const [key, productId] of next) if (productId && productIds.has(productId) && !keys.has(key)) next.delete(key);
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
  const pulseSize = pulse ? (findSize(pulse.size) ?? findSize(pulse.orderName) ?? findSize(pulse.name)) : null;
  const formSize = form ? (findSize(form.size) ?? findSize(form.description)) : null;
  if (!pulseSize || !formSize) return { state: "unknown", pulse: pulseSize?.label ?? null, form: formSize?.label ?? null };
  return {
    state: sizesClose(pulseSize.ml, formSize.ml) ? "same" : "different",
    pulse: pulseSize.label,
    form: formSize.label,
  };
}

function SizeCheckCell({ check }: { check: SizeCheck }) {
  if (check.state === "same") {
    return (
      <td className={cn(tdClass, "whitespace-nowrap text-center text-emerald-700")} title={`${check.pulse} = ${check.form}`}>
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
  const missing = !check.pulse && !check.form ? "either side" : !check.pulse ? "the Pulse product" : "the order form";
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
      {value == null ? "—" : value === 0 ? formatMoney(0) : `${value > 0 ? "+" : "−"}${formatMoney(Math.abs(value))}`}
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
  const [manual, setManual] = useState(() => new Map(matches.map((match) => [match.lineKey, match.productId])));
  /** Ticked rows (at most two). */
  const [picked, setPicked] = useState<string[]>([]);
  const [matchError, setMatchError] = useState<string | null>(null);
  const [saving, startSaving] = useTransition();
  const rows = useMemo(() => lineUp(products, lines ?? [], manual), [products, lines, manual]);
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

  function addDraft() {
    const key = crypto.randomUUID();
    setDrafts((current) => [...current, { key, sku: "", orderName: "", size: "", unitCost: "", rrp: "" }]);
    setFocusKey(key);
  }

  function updateDraft(key: string, patch: Partial<NewPriceListRow>) {
    setDrafts((current) => current.map((draft) => (draft.key === key ? { ...draft, ...patch } : draft)));
  }

  async function saveDrafts() {
    if (!onAddProducts) return;
    const filled = drafts.filter((draft) =>
      [draft.sku, draft.orderName, draft.size, draft.unitCost, draft.rrp].some((value) => value.trim()),
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
      await onAddProducts(filled.map(({ sku, orderName, size, unitCost, rrp }) => ({ sku, orderName, size, unitCost, rrp })));
      setDrafts([]);
    } catch (err) {
      setAddError(err instanceof Error ? err.message : "Could not add those products.");
    } finally {
      setAdding(false);
    }
  }

  /** Shows `next` straight away and saves it; puts the old matches back if saving fails. */
  function persist(next: Map<string, string | null>, save: (brand: string) => Promise<void>) {
    if (!brandId) return;
    const previous = manual;
    setManual(next);
    setPicked([]);
    setMatchError(null);
    startSaving(async () => {
      try {
        await save(brandId);
      } catch (err) {
        setManual(previous);
        setMatchError(err instanceof Error ? err.message : "Could not save that change.");
      }
    });
  }

  function apply(changes: OrderFormMatchChange[]) {
    if (changes.length === 0) return;
    persist(applyChanges(manual, changes), (brandKey) => saveOrderFormMatches(supplierId, brandKey, changes));
  }

  function togglePicked(rowId: string) {
    setPicked((current) =>
      current.includes(rowId) ? current.filter((id) => id !== rowId) : current.length >= 2 ? current : [...current, rowId],
    );
  }

  function resetAll() {
    if (!window.confirm(`Put every ${brand} row back on automatic matching?`)) return;
    persist(new Map(), (brandKey) => clearOrderFormMatches(supplierId, brandKey));
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
            {counts.sku} matched by SKU · <span className="text-amber-800">{counts.name} matched by name</span> ·{" "}
            <span className="text-sky-800">{counts.manual} swapped by you</span>
            {counts.manual > 0 ? (
              <button type="button" className="ml-1 text-sky-800 underline" disabled={saving} onClick={resetAll}>
                (reset all)
              </button>
            ) : null}{" "}
            ·{" "}
            <span className="text-red-700">
              {counts.formOnly} only on the order form · {counts.pulseOnly} only on Pulse
            </span>{" "}
            · {counts.size} size, {counts.cost} unit cost and {counts.rrp} RRP differences. To fix a pairing, tick two rows and click
            Swap; their Pulse products change places.
          </p>
        ) : (
          <p className="text-sm text-muted">Upload this brand&apos;s order form to compare it with these products.</p>
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
                <td className={cn(tdClass, "text-muted")} colSpan={hasForm ? pulseColumns + 10 : pulseColumns}>
                  No {brand} products on this price list yet.
                </td>
              </tr>
            ) : null}
            {rows.map((row) => {
              const rowId = rowIdOf(row);
              const isPicked = picked.includes(rowId);
              const tone =
                row.match === "manual"
                  ? "bg-sky-50"
                  : row.match === "name" || row.match === "similar" || row.namesDiffer
                    ? "bg-amber-50"
                    : "";
              const pulseTone = isPicked ? "bg-blue-100" : !hasForm ? "" : !row.form || !row.pulse ? "bg-red-50" : tone;
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
                <tr key={rowId}>
                  {pulse ? (
                    <>
                      {pickBox}
                      <td className={cn(tdClass, pulseTone, "whitespace-nowrap")}>{pulse.sku || "—"}</td>
                      <td className={cn(tdClass, pulseTone)}>{pulse.orderName || pulse.name}</td>
                      <td className={cn(tdClass, pulseTone, "whitespace-nowrap")}>{pulse.size || "—"}</td>
                      <td className={cn(tdClass, pulseTone, "text-right tabular-nums", costDiffers && "font-bold")}>
                        {formatMoney(pulse.unitCost)}
                      </td>
                      <td className={cn(tdClass, pulseTone, "text-right tabular-nums", rrpDiffers && "font-bold")}>
                        {pulse.rrp == null ? "—" : formatMoney(pulse.rrp)}
                      </td>
                      <td className={cn(tdClass, pulseTone)}>
                        <button
                          type="button"
                          className="text-sm text-blue-600 underline disabled:text-slate-400"
                          disabled={editDisabled}
                          onClick={() => onEditProduct(pulse.id, row.form)}
                          title={row.form ? "Edit this product (the order form line is shown for reference)" : "Edit this product"}
                        >
                          Edit
                        </button>
                      </td>
                    </>
                  ) : (
                    <>
                      {pickBox}
                      <td className={cn(tdClass, pulseTone, "text-sm text-red-700")} colSpan={6}>
                        Not on Pulse
                      </td>
                    </>
                  )}
                  {hasForm ? (
                    <>
                      <td className="w-3 bg-card" aria-hidden />
                      {row.form ? (
                        <>
                          <td className={cn(tdClass, formTone, "whitespace-nowrap")}>{row.form.sku || "—"}</td>
                          <td className={cn(tdClass, formTone)}>
                            {row.form.description}
                            <span className="block text-xs text-muted">{row.form.source}</span>
                          </td>
                          <td className={cn(tdClass, formTone, "whitespace-nowrap")}>{row.form.size || "—"}</td>
                          <td className={cn(tdClass, formTone, "text-right tabular-nums", costDiffers && "font-bold")}>
                            {row.form.cost == null ? "—" : formatMoney(row.form.cost)}
                          </td>
                          <td className={cn(tdClass, formTone, "text-right tabular-nums", rrpDiffers && "font-bold")}>
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
                    onClick={() => setDrafts((current) => current.filter((item) => item.key !== draft.key))}
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
              <button type="button" className={btnClass} disabled={adding} onClick={() => void saveDrafts()}>
                {adding ? "Saving…" : drafts.length === 1 ? "Save new product" : `Save ${drafts.length} new products`}
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
              <span className="text-sm text-muted">New products are added to {brand} on this price list.</span>
            </>
          ) : null}
          {addError ? <p className="w-full text-sm text-red-700">{addError}</p> : null}
        </div>
      ) : null}
    </section>

  );
}
