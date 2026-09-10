"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { unstable_rethrow, useRouter } from "next/navigation";
import {
  addCountEntryAction,
  completeInventoryCount,
  fillUncountedCountItems,
  saveCountQuantities,
  searchCountProductsAction,
} from "../actions";
import { formatDateTime, formatQty } from "@/lib/format";
import { keepOnSalonLabel, salonName } from "@/lib/labels";
import { searchFieldsMatch } from "@/lib/search";
import type { CountEntryLine, CountLine } from "../count-lines";
import { signedQty, sortCountLines, varianceTextClass } from "../count-lines";
import { btnClass, btnSecondaryClass, checkboxClass, fieldClass, tableClass, tdClass, thClass } from "@/lib/ui";
import { cn } from "@/lib/utils";

export type { CountLine } from "../count-lines";

type CountProduct = {
  productId: string;
  orderName: string;
  name: string;
  sku: string;
  brand: string;
  expected?: number;
  onCount?: boolean;
  onSalon?: boolean;
};

function liveVariance(expected: number, counted: string) {
  if (counted.trim() === "") return null;
  const amount = Number(counted);
  if (!Number.isFinite(amount)) return null;
  return amount - expected;
}

function productMatches(product: CountProduct, needle: string) {
  return searchFieldsMatch([product.orderName, product.name, product.sku, product.brand], needle);
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
      expected: item.expected,
      onCount: true,
      onSalon: true,
    });
  }
  return [...seen.values()];
}

function salonFlagsFromItems(
  items: CountLine[],
  salonProductIds: string[],
  extraOn: Iterable<string> = [],
) {
  const assigned = new Set([...salonProductIds, ...extraOn]);
  return Object.fromEntries(
    [...new Set(items.map((item) => item.productId))].map((productId) => [
      productId,
      assigned.has(productId),
    ]),
  );
}

function scannedProductIdsFrom(items: CountLine[], entries: CountEntryLine[]) {
  const itemIds = new Set(entries.map((entry) => entry.itemId));
  return items.filter((item) => itemIds.has(item.id)).map((item) => item.productId);
}

function namesFromItems(items: CountLine[]) {
  return Object.fromEntries(
    [...new Set(items.map((item) => item.productId))].map((productId) => {
      const item = items.find((row) => row.productId === productId);
      return [productId, item?.name ?? ""];
    }),
  );
}

function uniqueSortedLabels(values: string[]) {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))].sort((left, right) =>
    left.localeCompare(right, undefined, { sensitivity: "base" }),
  );
}

function matchesBrandFilters(item: CountLine, brand: string, brandSub: string) {
  if (brand && item.brand !== brand) return false;
  if (brandSub === "__none__" && item.brandSub.trim()) return false;
  if (brandSub && brandSub !== "__none__" && item.brandSub !== brandSub) return false;
  return true;
}

function tableBrands(rows: CountLine[]) {
  return uniqueSortedLabels(rows.map((item) => item.brand));
}

function tableBrandSubs(rows: CountLine[], brand: string) {
  const source = brand ? rows.filter((item) => item.brand === brand) : rows;
  return uniqueSortedLabels(source.map((item) => item.brandSub));
}

function BrandTableFilters({
  brand,
  brandSub,
  brands,
  brandSubs,
  onBrandChange,
  onBrandSubChange,
}: {
  brand: string;
  brandSub: string;
  brands: string[];
  brandSubs: string[];
  onBrandChange: (brand: string) => void;
  onBrandSubChange: (brandSub: string) => void;
}) {
  return (
    <div className="flex flex-wrap items-end gap-3">
      <label className="min-w-48 space-y-1 text-sm">
        <span>Brand</span>
        <select
          className={fieldClass}
          value={brand}
          onChange={(event) => onBrandChange(event.target.value)}
        >
          <option value="">All brands</option>
          {brands.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      </label>
      <label className="min-w-48 space-y-1 text-sm">
        <span>Brand_sub</span>
        <select
          className={fieldClass}
          value={brandSub}
          onChange={(event) => onBrandSubChange(event.target.value)}
        >
          <option value="">All product lines</option>
          <option value="__none__">No Brand_sub</option>
          {brandSubs.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      </label>
    </div>
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
  salonLockedIds,
  onSalonChange,
  names,
  nameEditable,
  onNameChange,
}: {
  rows: CountLine[];
  quantities: Record<string, string>;
  empty: string;
  frameClass?: string;
  salonHeader?: string;
  salonOn?: Record<string, boolean>;
  salonEditable?: boolean;
  salonLockedIds?: ReadonlySet<string>;
  onSalonChange?: (productId: string, on: boolean) => void;
  names?: Record<string, string>;
  nameEditable?: boolean;
  onNameChange?: (productId: string, name: string) => void;
}) {
  const showSalon = Boolean(salonHeader);
  const columns = showSalon ? 9 : 8;
  const displayRows = rows.map((item) => ({
    key: item.id,
    productId: item.productId,
    orderName: item.orderName,
    name: item.name,
    brand: item.brand,
    brandSub: item.brandSub,
    sizeLabel: item.sizeLabel,
    expected: item.expected,
    counted: quantities[item.id] ?? "",
  }));
  const salonLocked = (productId: string) => salonLockedIds?.has(productId) ?? false;
  const salonChecked = (productId: string) => salonLocked(productId) || Boolean(salonOn?.[productId]);
  const salonProductIds = [...new Set(displayRows.map((item) => item.productId))];
  const salonOnCount = salonProductIds.filter((productId) => salonChecked(productId)).length;
  const salonAllOn = salonProductIds.length > 0 && salonOnCount === salonProductIds.length;
  const salonSomeOn = salonOnCount > 0 && salonOnCount < salonProductIds.length;
  const salonAllLocked =
    salonProductIds.length > 0 && salonProductIds.every((productId) => salonLocked(productId));
  return (
    <div className={cn("overflow-x-auto rounded-xl border border-border bg-card", frameClass)}>
      <table className={tableClass}>
        <thead>
          <tr>
            {showSalon ? (
              <th className={cn(thClass, "min-w-36 whitespace-nowrap")}>
                <label className="inline-flex items-center gap-2">
                  <input
                    type="checkbox"
                    className={checkboxClass}
                    checked={salonAllOn}
                    ref={(input) => {
                      if (!input) return;
                      input.indeterminate = salonSomeOn;
                    }}
                    disabled={!salonEditable || salonProductIds.length === 0 || salonAllLocked}
                    aria-label={salonHeader}
                    onChange={(event) => {
                      const on = event.target.checked;
                      for (const productId of salonProductIds) {
                        if (!on && salonLocked(productId)) continue;
                        onSalonChange?.(productId, on);
                      }
                    }}
                  />
                  <span>{salonHeader}</span>
                </label>
              </th>
            ) : null}
            <th className={thClass}>Order name</th>
            <th className={thClass}>Name</th>
            <th className={thClass}>Brand</th>
            <th className={thClass}>Brand_sub</th>
            <th className={thClass}>Size</th>
            <th className={thClass}>Expected</th>
            <th className={thClass}>Counted</th>
            <th className={thClass}>Variance</th>
          </tr>
        </thead>
        <tbody>
          {displayRows.length === 0 ? (
            <tr>
              <td className={tdClass} colSpan={columns}>
                {empty}
              </td>
            </tr>
          ) : (
            displayRows.map((item) => {
              const variance = liveVariance(item.expected, item.counted);
              const lockedOnSalon = salonLocked(item.productId);
              const onSalon = salonChecked(item.productId);
              const name = names?.[item.productId] ?? item.name;
              return (
                <tr key={item.key}>
                  {showSalon ? (
                    <td className={tdClass}>
                      <input
                        type="checkbox"
                        className={checkboxClass}
                        checked={onSalon}
                        disabled={!salonEditable || lockedOnSalon}
                        aria-label={
                          lockedOnSalon
                            ? `${salonHeader} (counted products stay tagged)`
                            : salonHeader
                        }
                        onChange={(event) => onSalonChange?.(item.productId, event.target.checked)}
                      />
                    </td>
                  ) : null}
                  <td className={tdClass}>{item.orderName || "—"}</td>
                  <td className={tdClass}>
                    {nameEditable ? (
                      <input
                        className={cn(fieldClass, "min-w-40")}
                        value={name}
                        placeholder={item.orderName || "Falls back to order name"}
                        aria-label={`Salon name for ${item.orderName || "product"}`}
                        onChange={(event) => onNameChange?.(item.productId, event.target.value)}
                      />
                    ) : (
                      name || "—"
                    )}
                  </td>
                  <td className={tdClass}>{item.brand || "—"}</td>
                  <td className={tdClass}>{item.brandSub || "—"}</td>
                  <td className={tdClass}>{item.sizeLabel || "—"}</td>
                  <td className={tdClass}>{formatQty(item.expected)}</td>
                  <td className={tdClass}>{item.counted.trim() === "" ? "—" : formatQty(item.counted)}</td>
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
  branchName = "",
  salonProductIds = [],
  editable = true,
  mode = "count",
}: {
  countId: string;
  items: CountLine[];
  entries: CountEntryLine[];
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
    salonFlagsFromItems(items, salonProductIds, scannedProductIdsFrom(items, entries)),
  );
  const [names, setNames] = useState<Record<string, string>>(() => namesFromItems(items));
  const [query, setQuery] = useState("");
  const [searchQty, setSearchQty] = useState("");
  const [selectedProduct, setSelectedProduct] = useState<CountProduct | null>(null);
  const [catalogHits, setCatalogHits] = useState<CountProduct[]>([]);
  const [catalogReady, setCatalogReady] = useState(false);
  const [catalogError, setCatalogError] = useState<string | null>(null);
  const [countedBrandFilter, setCountedBrandFilter] = useState("");
  const [countedBrandSubFilter, setCountedBrandSubFilter] = useState("");
  const [uncountedBrandFilter, setUncountedBrandFilter] = useState("");
  const [uncountedBrandSubFilter, setUncountedBrandSubFilter] = useState("");
  const qtyRef = useRef<HTMLInputElement>(null);
  const productSearchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setQuantities(
      Object.fromEntries(items.map((item) => [item.id, item.counted == null ? "" : String(item.counted)])),
    );
  }, [items]);

  // Keep local salon ticks across quantity refreshes; reset when membership or product set changes.
  const salonSourceKey = `${[...salonProductIds].sort().join(",")}|${[...new Set(items.map((item) => item.productId))].sort().join(",")}|${[...new Set(entries.map((entry) => entry.itemId))].sort().join(",")}`;
  // eslint-disable-next-line react-hooks/exhaustive-deps -- salonSourceKey captures salonProductIds and product ids
  useEffect(() => {
    setSalonOn(salonFlagsFromItems(items, salonProductIds, scannedProductIdsFrom(items, entries)));
  }, [salonSourceKey]);

  const productIdsKey = [...new Set(items.map((item) => item.productId))].sort().join(",");
  // eslint-disable-next-line react-hooks/exhaustive-deps -- keep typed names across quantity refreshes
  useEffect(() => {
    setNames((current) => {
      const defaults = namesFromItems(items);
      const next: Record<string, string> = {};
      for (const productId of Object.keys(defaults)) {
        next[productId] = productId in current ? current[productId] : defaults[productId];
      }
      return next;
    });
  }, [productIdsKey]);

  const products = useMemo(() => uniqueProducts(items), [items]);
  const needle = query.trim().toLowerCase();
  const localMatches = useMemo(() => {
    if (!needle) return [];
    return products.filter((product) => productMatches(product, needle)).slice(0, 8);
  }, [needle, products]);

  useEffect(() => {
    if (selectedProduct || needle.length < 2) {
      setCatalogHits([]);
      setCatalogReady(false);
      setCatalogError(null);
      return;
    }
    let cancelled = false;
    setCatalogReady(false);
    setCatalogError(null);
    const timer = window.setTimeout(() => {
      void searchCountProductsAction(countId, query)
        .then((hits) => {
          if (cancelled) return;
          setCatalogHits(
            hits.map((hit) => ({
              productId: hit.productId,
              orderName: hit.orderName,
              name: hit.name,
              sku: hit.sku,
              brand: hit.brand,
              expected: hit.expected,
              onCount: hit.onCount,
              onSalon: hit.onSalon,
            })),
          );
          setCatalogReady(true);
        })
        .catch((err) => {
          if (cancelled) return;
          setCatalogHits([]);
          setCatalogReady(true);
          setCatalogError(err instanceof Error ? err.message : "Could not search the catalog.");
        });
    }, 200);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [countId, needle, query, selectedProduct]);

  const matches = useMemo(() => {
    const byId = new Map<string, CountProduct>();
    for (const product of localMatches) byId.set(product.productId, product);
    for (const product of catalogHits) {
      const current = byId.get(product.productId);
      byId.set(product.productId, current ? { ...current, ...product } : product);
    }
    return [...byId.values()]
      .sort((left, right) => Number(right.onSalon === false) - Number(left.onSalon === false))
      .slice(0, 16);
  }, [catalogHits, localMatches]);
  const selectedLine = selectedProduct
    ? (items.find((item) => item.productId === selectedProduct.productId) ?? null)
    : null;
  const selectedExpected = selectedLine?.expected ?? selectedProduct?.expected;
  const selectedCounted = selectedLine ? (selectedLine.counted ?? 0) : selectedProduct ? 0 : null;

  const summaryRows = useMemo(
    () => sortCountLines(items.filter((item) => item.counted != null)),
    [items],
  );
  const scannedItemIds = useMemo(() => new Set(entries.map((entry) => entry.itemId)), [entries]);
  const countedRows = useMemo(
    () => sortCountLines(items.filter((item) => scannedItemIds.has(item.id))),
    [items, scannedItemIds],
  );
  const countedProductIds = useMemo(
    () => new Set(countedRows.map((item) => item.productId)),
    [countedRows],
  );
  const uncountedRows = useMemo(
    () => sortCountLines(items.filter((item) => !scannedItemIds.has(item.id))),
    [items, scannedItemIds],
  );
  const countedBrands = useMemo(() => tableBrands(countedRows), [countedRows]);
  const countedBrandSubs = useMemo(
    () => tableBrandSubs(countedRows, countedBrandFilter),
    [countedBrandFilter, countedRows],
  );
  const uncountedBrands = useMemo(() => tableBrands(uncountedRows), [uncountedRows]);
  const uncountedBrandSubs = useMemo(
    () => tableBrandSubs(uncountedRows, uncountedBrandFilter),
    [uncountedBrandFilter, uncountedRows],
  );
  const filteredCountedRows = useMemo(
    () => countedRows.filter((item) => matchesBrandFilters(item, countedBrandFilter, countedBrandSubFilter)),
    [countedBrandFilter, countedBrandSubFilter, countedRows],
  );
  const filteredUncountedRows = useMemo(
    () =>
      uncountedRows.filter((item) =>
        matchesBrandFilters(item, uncountedBrandFilter, uncountedBrandSubFilter),
      ),
    [uncountedBrandFilter, uncountedBrandSubFilter, uncountedRows],
  );
  const missing = items.filter((item) => (quantities[item.id] ?? "").trim() === "").length;

  function pickMatch(product: CountProduct) {
    setSelectedProduct(product);
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
      formData.set(
        `salon:${productId}`,
        countedProductIds.has(productId) || salonOn[productId] ? "1" : "0",
      );
      if (kind === "complete") formData.set(`name:${productId}`, names[productId] ?? "");
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
    const amount = Number(searchQty);
    if (searchQty.trim() === "" || !Number.isFinite(amount) || amount === 0) {
      setError("Enter an amount to add or deduct. Use a negative number to reduce the counted total.");
      return;
    }
    const target = items.find((item) => item.productId === product.productId);
    const current = Number(target?.counted ?? 0);
    if (current + amount < 0) {
      setError(`Cannot deduct ${formatQty(Math.abs(amount))}. Counted is ${formatQty(current)}.`);
      return;
    }

    const formData = new FormData();
    formData.set("count_id", countId);
    formData.set("product_id", product.productId);
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
      setQuery("");
      setSelectedProduct(null);
      setSearchQty("");
      setCatalogHits([]);
      setCatalogReady(false);
      if (editable) window.setTimeout(() => productSearchRef.current?.focus(), 0);
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
    for (const item of filteredUncountedRows) formData.append("item_id", item.id);
    setPending(mode);
    setError(null);
    setMessage(null);
    try {
      await persistReview("save");
      await fillUncountedCountItems(formData);
      setMessage(
        mode === "zero"
          ? "Remaining products counted as 0. You can switch to keep the expected quantity."
          : "Remaining products kept at the expected quantity. You can switch to count as 0.",
      );
      router.refresh();
    } catch (err) {
      unstable_rethrow(err);
      setError(err instanceof Error ? err.message : "Could not fill remaining products.");
    } finally {
      setPending(null);
    }
  }

  const salonLabel = salonName(branchName) || "this salon";
  const salonHeader = keepOnSalonLabel(branchName);
  const uncountedFilledAsZero =
    filteredUncountedRows.length > 0 &&
    filteredUncountedRows.every((item) => {
      const value = quantities[item.id] ?? "";
      return value !== "" && Number(value) === 0;
    });
  const uncountedFilledAsKeep =
    filteredUncountedRows.length > 0 &&
    filteredUncountedRows.every((item) => {
      const value = quantities[item.id] ?? "";
      return value !== "" && Number(value) === item.expected;
    });

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
        <div className="grid gap-3 rounded-xl border border-border bg-card p-4 md:grid-cols-[minmax(0,1.4fr)_8rem_8rem_8rem_auto]">
          <label className="relative space-y-1 text-sm">
            <span>Find product</span>
            <input
              ref={productSearchRef}
              className={fieldClass}
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                setSelectedProduct(null);
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
                      {product.onSalon === false ? (
                        <span className="block text-xs text-muted">
                          Not on {salonLabel} yet — counting it will add it
                        </span>
                      ) : null}
                    </button>
                  </li>
                ))}
              </ul>
            ) : needle && !selectedProduct && catalogError ? (
              <p className="absolute z-20 mt-1 w-full rounded-lg border border-red-200 bg-white px-3 py-2 text-sm text-red-800 shadow-lg">
                {catalogError}
              </p>
            ) : needle && !selectedProduct && catalogReady && matches.length === 0 ? (
              <p className="absolute z-20 mt-1 w-full rounded-lg border border-border bg-white px-3 py-2 text-sm text-muted shadow-lg">
                No matching products in the catalog.
              </p>
            ) : null}
          </label>
          <label className="space-y-1 text-sm">
            <span>Expected</span>
            <p className={cn(fieldClass, "bg-slate-50 text-slate-800")}>
              {selectedExpected == null ? "—" : formatQty(selectedExpected)}
            </p>
          </label>
          <label className="space-y-1 text-sm">
            <span>Counted</span>
            <p className={cn(fieldClass, "bg-slate-50 text-slate-800")}>
              {selectedCounted == null ? "—" : formatQty(selectedCounted)}
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
          Quantities come from counting or the bulk actions on uncounted products. Edit Name to set the
          salon-friendly name shared by Min and Kin — confirming this count replaces the existing names.
          A ticked {salonHeader} checkbox leaves the product on {salonLabel}.
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
                      <th className={thClass}>Size</th>
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
                          <td className={tdClass}>{entry.sizeLabel || "—"}</td>
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
            <BrandTableFilters
              brand={countedBrandFilter}
              brandSub={countedBrandSubFilter}
              brands={countedBrands}
              brandSubs={countedBrandSubs}
              onBrandChange={(brand) => {
                setCountedBrandFilter(brand);
                setCountedBrandSubFilter("");
              }}
              onBrandSubChange={setCountedBrandSubFilter}
            />
            <CountLinesTable
              rows={filteredCountedRows}
              quantities={quantities}
              empty={
                countedRows.length === 0
                  ? "No products scanned on the counting page."
                  : "No counted products match these filters."
              }
              salonHeader={salonHeader}
              salonOn={salonOn}
              salonEditable={editable}
              salonLockedIds={countedProductIds}
              onSalonChange={(productId, on) => {
                if (!on && countedProductIds.has(productId)) return;
                setSalonOn((current) => ({ ...current, [productId]: on }));
              }}
              names={names}
              nameEditable={editable}
              onNameChange={(productId, name) =>
                setNames((current) => ({ ...current, [productId]: name }))
              }
            />
          </div>
          <div className="space-y-2">
            <h2 className="text-sm font-medium">Not counted</h2>
            <BrandTableFilters
              brand={uncountedBrandFilter}
              brandSub={uncountedBrandSubFilter}
              brands={uncountedBrands}
              brandSubs={uncountedBrandSubs}
              onBrandChange={(brand) => {
                setUncountedBrandFilter(brand);
                setUncountedBrandSubFilter("");
              }}
              onBrandSubChange={setUncountedBrandSubFilter}
            />
            {missing > 0 ? (
              <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-3 text-sm text-red-800">
                {missing} product{missing === 1 ? "" : "s"} still uncounted. Count remaining products as 0 or
                keep the expected quantity. Counted products stay on {salonLabel}. Use {salonHeader} here to
                tick or untick remaining products.
              </p>
            ) : null}
            {editable && filteredUncountedRows.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                <button
                  className={uncountedFilledAsZero && !uncountedFilledAsKeep ? btnClass : btnSecondaryClass}
                  disabled={pending !== null}
                  type="button"
                  onClick={() => void fillUncounted("zero")}
                >
                  {pending === "zero" ? "Updating…" : "Count all as 0"}
                </button>
                <button
                  className={uncountedFilledAsKeep ? btnClass : btnSecondaryClass}
                  disabled={pending !== null}
                  type="button"
                  onClick={() => void fillUncounted("keep")}
                >
                  {pending === "keep" ? "Updating…" : "Keep current quantity"}
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
              rows={filteredUncountedRows}
              quantities={quantities}
              empty={
                uncountedRows.length === 0
                  ? "Every product in this count was scanned."
                  : "No uncounted products match these filters."
              }
              salonHeader={salonHeader}
              salonOn={salonOn}
              salonEditable={editable}
              salonLockedIds={countedProductIds}
              onSalonChange={(productId, on) => {
                if (!on && countedProductIds.has(productId)) return;
                setSalonOn((current) => ({ ...current, [productId]: on }));
              }}
              names={names}
              nameEditable={editable}
              onNameChange={(productId, name) =>
                setNames((current) => ({ ...current, [productId]: name }))
              }
            />
          </div>
        </div>
      )}
    </div>
  );
}
