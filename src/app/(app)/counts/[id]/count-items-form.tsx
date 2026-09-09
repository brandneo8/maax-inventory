"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { unstable_rethrow, useRouter } from "next/navigation";
import {
  addCountEntryAction,
  completeInventoryCount,
  fillUncountedCountItems,
  saveCountQuantities,
} from "../actions";
import { formatDateTime, formatQty } from "@/lib/format";
import { salonChipLabel, salonName } from "@/lib/labels";
import type { CountEntryLine, CountLine, CountLocationOption } from "../count-lines";
import { signedQty, sortCountLines, varianceTextClass } from "../count-lines";
import { btnClass, btnSecondaryClass, fieldClass, tableClass, tdClass, thClass } from "@/lib/ui";
import { cn } from "@/lib/utils";

export type { CountLine } from "../count-lines";

type CountProduct = {
  productId: string;
  orderName: string;
  name: string;
  sku: string;
  brand: string;
};

function liveVariance(expected: number, counted: string) {
  if (counted.trim() === "") return null;
  const amount = Number(counted);
  if (!Number.isFinite(amount)) return null;
  return amount - expected;
}

function productMatches(product: CountProduct, needle: string) {
  if (!needle) return true;
  return [product.orderName, product.name, product.sku, product.brand].some((value) =>
    value.toLowerCase().includes(needle),
  );
}

function lineTitle(item: { name: string; orderName: string; sku: string }) {
  return item.name.trim() || item.orderName.trim() || item.sku || "Untitled product";
}

function uniqueProducts(items: CountLine[]): CountProduct[] {
  const seen = new Map<string, CountProduct>();
  for (const item of items) {
    if (seen.has(item.productId)) continue;
    seen.set(item.productId, {
      productId: item.productId,
      orderName: item.orderName,
      name: item.name,
      sku: item.sku,
      brand: item.brand,
    });
  }
  return [...seen.values()];
}

function salonFlagsFromItems(items: CountLine[], salonProductIds: string[]) {
  const assigned = new Set(salonProductIds);
  return Object.fromEntries(
    [...new Set(items.map((item) => item.productId))].map((productId) => [
      productId,
      assigned.has(productId),
    ]),
  );
}

function CountLinesTable({
  rows,
  quantities,
  empty,
  frameClass,
  salonHeader,
  salonOn,
  salonEditable,
  onSalonChange,
}: {
  rows: CountLine[];
  quantities: Record<string, string>;
  empty: string;
  frameClass?: string;
  salonHeader?: string;
  salonOn?: Record<string, boolean>;
  salonEditable?: boolean;
  onSalonChange?: (productId: string, on: boolean) => void;
}) {
  const showSalon = Boolean(salonHeader);
  const columns = showSalon ? 8 : 7;
  return (
    <div className={cn("overflow-x-auto rounded-xl border border-border bg-card", frameClass)}>
      <table className={tableClass}>
        <thead>
          <tr>
            {showSalon ? (
              <th className={cn(thClass, "w-16 capitalize")}>{salonHeader}</th>
            ) : null}
            <th className={thClass}>Order name</th>
            <th className={thClass}>Name</th>
            <th className={thClass}>Brand</th>
            <th className={thClass}>Location</th>
            <th className={thClass}>Expected</th>
            <th className={thClass}>Counted</th>
            <th className={thClass}>Variance</th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td className={tdClass} colSpan={columns}>
                {empty}
              </td>
            </tr>
          ) : (
            rows.map((item) => {
              const counted = quantities[item.id] ?? "";
              const variance = liveVariance(item.expected, counted);
              const onSalon = salonOn?.[item.productId] ?? false;
              return (
                <tr key={item.id}>
                  {showSalon ? (
                    <td className={tdClass}>
                      <input
                        type="checkbox"
                        checked={onSalon}
                        disabled={!salonEditable}
                        aria-label={`Available at ${salonHeader}`}
                        onChange={(event) => onSalonChange?.(item.productId, event.target.checked)}
                      />
                    </td>
                  ) : null}
                  <td className={tdClass}>{item.orderName || "—"}</td>
                  <td className={tdClass}>{item.name || "—"}</td>
                  <td className={tdClass}>{item.brand || "—"}</td>
                  <td className={tdClass}>{item.location}</td>
                  <td className={tdClass}>{formatQty(item.expected)}</td>
                  <td className={tdClass}>{counted.trim() === "" ? "—" : formatQty(counted)}</td>
                  <td className={cn(tdClass, varianceTextClass(variance))}>
                    {variance === null ? "—" : signedQty(variance)}
                  </td>
                </tr>
              );
            })
          )}
        </tbody>
      </table>
    </div>
  );
}

export function CountItemsForm({
  countId,
  items,
  entries,
  locations,
  lockedLocationId = null,
  branchName = "",
  salonProductIds = [],
  editable = true,
  mode = "count",
}: {
  countId: string;
  items: CountLine[];
  entries: CountEntryLine[];
  locations: CountLocationOption[];
  lockedLocationId?: string | null;
  branchName?: string;
  salonProductIds?: string[];
  editable?: boolean;
  mode?: "count" | "review";
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, setPending] = useState<
    "save" | "complete" | "count" | "review" | "zero" | "keep" | null
  >(null);
  const [quantities, setQuantities] = useState<Record<string, string>>(() =>
    Object.fromEntries(items.map((item) => [item.id, item.counted == null ? "" : String(item.counted)])),
  );
  const [salonOn, setSalonOn] = useState<Record<string, boolean>>(() =>
    salonFlagsFromItems(items, salonProductIds),
  );
  const [query, setQuery] = useState("");
  const [searchQty, setSearchQty] = useState("");
  const [selectedProductId, setSelectedProductId] = useState<string | null>(null);
  const [locationId, setLocationId] = useState(
    lockedLocationId ?? locations[0]?.id ?? "",
  );
  const qtyRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setQuantities(
      Object.fromEntries(items.map((item) => [item.id, item.counted == null ? "" : String(item.counted)])),
    );
  }, [items]);

  // Keep local salon ticks across quantity refreshes; reset when membership or product set changes.
  const salonSourceKey = `${[...salonProductIds].sort().join(",")}|${[...new Set(items.map((item) => item.productId))].sort().join(",")}`;
  // eslint-disable-next-line react-hooks/exhaustive-deps -- salonSourceKey captures salonProductIds and product ids
  useEffect(() => {
    setSalonOn(salonFlagsFromItems(items, salonProductIds));
  }, [salonSourceKey]);

  useEffect(() => {
    if (lockedLocationId) setLocationId(lockedLocationId);
  }, [lockedLocationId]);

  const products = useMemo(() => uniqueProducts(items), [items]);
  const needle = query.trim().toLowerCase();
  const matches = useMemo(() => {
    if (!needle) return [];
    return products.filter((product) => productMatches(product, needle)).slice(0, 8);
  }, [needle, products]);

  const selectedProduct =
    selectedProductId ? (products.find((product) => product.productId === selectedProductId) ?? null) : null;
  const selectedLine = selectedProduct
    ? (items.find(
        (item) => item.productId === selectedProduct.productId && item.storeLocationId === locationId,
      ) ?? null)
    : null;

  const summaryRows = useMemo(
    () => sortCountLines(items.filter((item) => item.counted != null)),
    [items],
  );
  const scannedItemIds = useMemo(() => new Set(entries.map((entry) => entry.itemId)), [entries]);
  const countedRows = useMemo(
    () => sortCountLines(items.filter((item) => scannedItemIds.has(item.id))),
    [items, scannedItemIds],
  );
  const uncountedRows = useMemo(
    () => sortCountLines(items.filter((item) => !scannedItemIds.has(item.id))),
    [items, scannedItemIds],
  );
  const missing = items.filter((item) => (quantities[item.id] ?? "").trim() === "").length;
  const locationLocked = Boolean(lockedLocationId) || locations.length <= 1;

  function pickMatch(product: CountProduct) {
    setSelectedProductId(product.productId);
    setQuery(product.brand ? `${lineTitle(product)} · ${product.brand}` : lineTitle(product));
    setSearchQty("");
    if (editable) window.setTimeout(() => qtyRef.current?.focus(), 0);
  }

  async function persistReview(kind: "save" | "complete") {
    const formData = new FormData();
    formData.set("count_id", countId);
    for (const item of items) {
      const value = quantities[item.id];
      if (value != null && value !== "") formData.set(`counted:${item.id}`, value);
    }
    for (const productId of new Set(items.map((item) => item.productId))) {
      formData.set(`salon:${productId}`, salonOn[productId] ? "1" : "0");
    }
    await saveCountQuantities(formData);
    if (kind === "complete") await completeInventoryCount(formData);
  }

  async function applySearchCount() {
    const product = selectedProduct ?? (matches.length === 1 ? matches[0] : null);
    if (!product) {
      setError("Search a product or brand, then choose the line to count.");
      return;
    }
    if (!locationId) {
      setError("Select the location you are counting.");
      return;
    }
    const amount = Number(searchQty);
    if (searchQty.trim() === "" || !Number.isFinite(amount) || amount === 0) {
      setError("Enter an amount to add or deduct. Use a negative number to reduce the counted total.");
      return;
    }
    const target = items.find(
      (item) => item.productId === product.productId && item.storeLocationId === locationId,
    );
    if (!target) {
      setError("That product is not in this count for the selected location.");
      return;
    }
    const current = Number(target.counted ?? 0);
    if (current + amount < 0) {
      setError(`Cannot deduct ${formatQty(Math.abs(amount))}. Counted is ${formatQty(current)}.`);
      return;
    }

    const formData = new FormData();
    formData.set("count_id", countId);
    formData.set("product_id", product.productId);
    formData.set("store_location_id", locationId);
    formData.set("quantity_delta", String(amount));

    setPending("count");
    setError(null);
    setMessage(null);
    try {
      await addCountEntryAction(formData);
      const next = current + amount;
      setMessage(
        `Applied ${signedQty(amount)} to ${lineTitle(product)}. Counted is now ${formatQty(next)}.`,
      );
      setSearchQty("");
      if (editable) window.setTimeout(() => qtyRef.current?.focus(), 0);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save that count.");
    } finally {
      setPending(null);
    }
  }

  async function run(kind: "save" | "complete" | "review") {
    setPending(kind);
    setError(null);
    setMessage(null);
    try {
      if (kind === "review") {
        router.push(`/counts/${countId}/review`);
        return;
      }
      await persistReview(kind);
      if (kind === "save") setMessage("Draft saved. You can leave and finish this count later.");
    } catch (err) {
      unstable_rethrow(err);
      setError(err instanceof Error ? err.message : "Could not update the count.");
    } finally {
      setPending(null);
    }
  }

  async function fillUncounted(mode: "zero" | "keep") {
    const formData = new FormData();
    formData.set("count_id", countId);
    formData.set("mode", mode);
    setPending(mode);
    setError(null);
    setMessage(null);
    try {
      await persistReview("save");
      await fillUncountedCountItems(formData);
      setMessage(
        mode === "zero"
          ? "Remaining lines counted as 0."
          : "Remaining lines kept at the expected quantity.",
      );
      router.refresh();
    } catch (err) {
      unstable_rethrow(err);
      setError(err instanceof Error ? err.message : "Could not fill remaining lines.");
    } finally {
      setPending(null);
    }
  }

  function dropUncountedFromSalonList() {
    const productIds = [...new Set(uncountedRows.map((item) => item.productId))];
    setSalonOn((current) => {
      const next = { ...current };
      for (const productId of productIds) next[productId] = false;
      return next;
    });
    setError(null);
    setMessage(
      productIds.length === 0
        ? `No uncounted products to drop from ${salonName(branchName) || "this salon"}.`
        : `Unchecked ${productIds.length} product${productIds.length === 1 ? "" : "s"} from the ${salonName(branchName) || "salon"} list. Tick individual rows to keep them, then save or confirm.`,
    );
  }

  const salonLabel = salonName(branchName) || "this salon";
  const salonHeader = salonChipLabel(branchName) || "salon";

  return (
    <div className="space-y-4">
      {editable ? (
        <div className="flex flex-wrap justify-end gap-2">
          {mode === "review" ? (
            <>
              <button
                className={btnSecondaryClass}
                disabled={pending !== null}
                type="button"
                onClick={() => void run("save")}
              >
                {pending === "save" ? "Saving draft…" : "Save draft"}
              </button>
              <button
                className={btnClass}
                disabled={pending !== null || missing > 0}
                type="button"
                onClick={() => void run("complete")}
              >
                {pending === "complete" ? "Posting…" : "Confirm and post variances"}
              </button>
            </>
          ) : (
            <button
              className={btnClass}
              disabled={pending !== null}
              type="button"
              onClick={() => void run("review")}
            >
              {pending === "review" ? "Opening…" : "Review summary"}
            </button>
          )}
        </div>
      ) : null}

      {mode === "count" && editable ? (
        <div className="grid gap-3 rounded-xl border border-border bg-card p-4 md:grid-cols-[minmax(0,1.4fr)_10rem_8rem_8rem_10rem_auto]">
          <label className="relative space-y-1 text-sm">
            <span>Find product</span>
            <input
              className={fieldClass}
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                setSelectedProductId(null);
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  if (!selectedProduct && matches[0]) pickMatch(matches[0]);
                  else void applySearchCount();
                }
              }}
              placeholder="Product name, order name, or brand"
              autoComplete="off"
            />
            {needle && !selectedProduct && matches.length > 0 ? (
              <ul className="absolute z-20 mt-1 max-h-64 w-full overflow-auto rounded-lg border border-border bg-white py-1 shadow-lg">
                {matches.map((product) => (
                  <li key={product.productId}>
                    <button
                      className="block w-full px-3 py-2 text-left text-sm hover:bg-slate-50"
                      type="button"
                      onClick={() => pickMatch(product)}
                    >
                      <span className="block font-medium">
                        {product.orderName || product.name || product.sku}
                      </span>
                      {product.name && product.name !== product.orderName ? (
                        <span className="block text-xs text-muted">{product.name}</span>
                      ) : null}
                      <span className="block text-xs text-muted">{product.brand || "No brand"}</span>
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
            {needle && !selectedProduct && matches.length === 0 ? (
              <p className="absolute z-20 mt-1 w-full rounded-lg border border-border bg-white px-3 py-2 text-sm text-muted shadow-lg">
                No matching products in this count.
              </p>
            ) : null}
          </label>
          <label className="space-y-1 text-sm">
            <span>Location</span>
            <select
              className={fieldClass}
              value={locationId}
              disabled={locationLocked}
              onChange={(event) => setLocationId(event.target.value)}
            >
              {locations.length === 0 ? <option value="">No locations</option> : null}
              {locations.map((location) => (
                <option key={location.id} value={location.id}>
                  {location.name}
                </option>
              ))}
            </select>
          </label>
          <label className="space-y-1 text-sm">
            <span>Expected</span>
            <p className={cn(fieldClass, "bg-slate-50 text-slate-800")}>
              {selectedLine ? formatQty(selectedLine.expected) : "—"}
            </p>
          </label>
          <label className="space-y-1 text-sm">
            <span>Counted</span>
            <p className={cn(fieldClass, "bg-slate-50 text-slate-800")}>
              {selectedLine ? formatQty(selectedLine.counted ?? 0) : "—"}
            </p>
          </label>
          <label className="space-y-1 text-sm">
            <span>Add / deduct</span>
            <input
              ref={qtyRef}
              className={fieldClass}
              type="number"
              step="0.01"
              value={searchQty}
              onChange={(event) => setSearchQty(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  void applySearchCount();
                }
              }}
              placeholder="+ / −"
            />
          </label>
          <div className="flex items-end">
            <button
              className={btnClass}
              type="button"
              disabled={pending !== null}
              onClick={() => void applySearchCount()}
            >
              {pending === "count" ? "Updating…" : "Apply"}
            </button>
          </div>
        </div>
      ) : mode === "review" ? (
        <p className="text-sm text-muted">
          Quantities come from counting or the bulk actions on uncounted lines. Untick a product to drop
          it from the {salonLabel} list, then save or confirm.
        </p>
      ) : null}

      {mode === "count" && error ? (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p>
      ) : null}
      {mode === "count" && message ? (
        <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
          {message}
        </p>
      ) : null}

      {mode === "count" ? (
        entries.length === 0 && summaryRows.length === 0 ? null : (
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <h2 className="text-sm font-medium">Transactions</h2>
              <div className="overflow-x-auto rounded-xl border border-slate-300 bg-card">
                <table className={tableClass}>
                  <thead>
                    <tr>
                      <th className={thClass}>Product</th>
                      <th className={thClass}>Location</th>
                      <th className={thClass}>Qty</th>
                      <th className={thClass}>Time</th>
                    </tr>
                  </thead>
                  <tbody>
                    {entries.length === 0 ? (
                      <tr>
                        <td className={tdClass} colSpan={4}>
                          No scans yet.
                        </td>
                      </tr>
                    ) : (
                      entries.map((entry) => (
                        <tr key={entry.id}>
                          <td className={tdClass}>
                            <span className="block">{entry.orderName || entry.name || "—"}</span>
                            {entry.name && entry.name !== entry.orderName ? (
                              <span className="block text-xs text-muted">{entry.name}</span>
                            ) : null}
                          </td>
                          <td className={tdClass}>{entry.location}</td>
                          <td className={cn(tdClass, varianceTextClass(entry.quantityDelta))}>
                            {signedQty(entry.quantityDelta)}
                          </td>
                          <td className={tdClass}>{formatDateTime(entry.createdAt)}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
            <div className="space-y-2">
              <h2 className="text-sm font-medium">Summary</h2>
              <CountLinesTable
                rows={summaryRows}
                quantities={Object.fromEntries(
                  summaryRows.map((item) => [item.id, item.counted == null ? "" : String(item.counted)]),
                )}
                empty="No products counted yet."
                frameClass="border-slate-300"
              />
            </div>
          </div>
        )
      ) : (
        <div className="space-y-6">
          <div className="space-y-2">
            <h2 className="text-sm font-medium">Counted</h2>
            <CountLinesTable
              rows={countedRows}
              quantities={quantities}
              empty="No products scanned on the counting page."
              salonHeader={salonHeader}
              salonOn={salonOn}
              salonEditable={editable}
              onSalonChange={(productId, on) =>
                setSalonOn((current) => ({ ...current, [productId]: on }))
              }
            />
          </div>
          <div className="space-y-2">
            <h2 className="text-sm font-medium">Not counted</h2>
            {missing > 0 ? (
              <div className="space-y-3 rounded-lg border border-red-200 bg-red-50 px-3 py-3 text-sm text-red-800">
                <p>
                  {missing} line{missing === 1 ? "" : "s"} still uncounted. Count remaining products as
                  0 or keep the expected quantity. Drop from {salonLabel} unchecks those products from
                  the salon list — you can tick individual rows back on.
                </p>
                {editable ? (
                  <div className="flex flex-wrap gap-2">
                    <button
                      className={btnClass}
                      disabled={pending !== null}
                      type="button"
                      onClick={() => void fillUncounted("zero")}
                    >
                      {pending === "zero" ? "Updating…" : "Count all as 0"}
                    </button>
                    <button
                      className={btnSecondaryClass}
                      disabled={pending !== null}
                      type="button"
                      onClick={() => void fillUncounted("keep")}
                    >
                      {pending === "keep" ? "Updating…" : "Keep current quantity"}
                    </button>
                    <button
                      className={btnSecondaryClass}
                      disabled={pending !== null}
                      type="button"
                      onClick={dropUncountedFromSalonList}
                    >
                      Drop from {salonLabel}
                    </button>
                  </div>
                ) : null}
              </div>
            ) : editable && uncountedRows.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                <button
                  className={btnSecondaryClass}
                  disabled={pending !== null}
                  type="button"
                  onClick={dropUncountedFromSalonList}
                >
                  Drop from {salonLabel}
                </button>
              </div>
            ) : null}
            {mode === "review" && error ? (
              <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
                {error}
              </p>
            ) : null}
            {mode === "review" && message ? (
              <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
                {message}
              </p>
            ) : null}
            <CountLinesTable
              rows={uncountedRows}
              quantities={quantities}
              empty="Every product in this count was scanned."
              salonHeader={salonHeader}
              salonOn={salonOn}
              salonEditable={editable}
              onSalonChange={(productId, on) =>
                setSalonOn((current) => ({ ...current, [productId]: on }))
              }
            />
          </div>
        </div>
      )}
    </div>
  );
}
